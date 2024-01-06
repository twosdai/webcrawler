const fs = require("fs");
const EventEmitter = require("events");
const robotsParser = require("robots-parser");
const fetch = require("cross-fetch");
const cheerio = require("cheerio");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

class MyEmitter extends EventEmitter {}
const myEmitter = new MyEmitter();
const visitedUrls = new Set();
const robotsTxtCache = new Map();
const downloadedImages = new Set();
let jsonData = {};

// Main function
function main(startUrl) {
  process.on("uncaughtException", function (err) {
    console.log("UNCAUGHT EXCEPTION - keeping process alive:", err);
  });
  myEmitter.on("processWebpage", processWebpage);
  myEmitter.on("processAnchor", processAnchor);
  myEmitter.on("crawl", crawl);
  console.log("starting crawl");
  myEmitter.emit("crawl", startUrl);
}

// Function to process webpage
async function processWebpage(pageUrl, previousUrl) {
  console.log(`processing ${pageUrl}`);
  try {
    const response = await fetch(pageUrl);
    console.log(`response: ${response.ok}`);
    if (response.ok) {
      const html = await response.text();
      const $ = cheerio.load(html);

      $("a").each((i, link) => {
        try {
          console.log(`processing anchor ${link}`);
          const href = $(link).attr("href");
          myEmitter.emit("processAnchor", pageUrl, href, previousUrl);
        } catch (error) {
          console.error(`Error processing anchor ${link}: ${error.message}`);
        }
      });
      $("img").each(async (i, img) => {
        try {
          const imgUrl = $(img).attr("src");
          const absoluteImgUrl = new URL(imgUrl, pageUrl).href;
          if (!downloadedImages.has(absoluteImgUrl)) {
            const filePath = await downloadImage(absoluteImgUrl);
            updateJsonStructureForImages(pageUrl, absoluteImgUrl, filePath);
            downloadedImages.add(absoluteImgUrl);
          } else {
            const filePath = path.join(
              __dirname,
              "downloaded_images",
              path.basename(new URL(absoluteImgUrl).pathname)
            );
            updateJsonStructureForImages(pageUrl, absoluteImgUrl, filePath);
          }
        } catch (error) {
          console.error(`Error downloading image  ${error.message}`);
        }
      });
    } else {
      console.error(
        `Failed to fetch ${pageUrl}: Status Code ${response.status}`
      );
    }
  } catch (error) {
    console.error(`Error fetching ${pageUrl}: ${error.message}`);
  }
}

// Function to process anchor
function processAnchor(pageUrl, anchor, previousUrl) {
  console.log(`processing anchor ${anchor}`);
  const absoluteUrl = new URL(anchor, pageUrl).href;
  if (!visitedUrls.has(absoluteUrl)) {
    myEmitter.emit("crawl", absoluteUrl, pageUrl);
  }
  console.log(`absoluteUrl: ${absoluteUrl}`);
  updateJsonStructure(pageUrl, absoluteUrl, previousUrl);
  writeToJson(jsonData);
}

// Update JSON Structure
function updateJsonStructure(pageUrl, anchorUrl, previousUrl) {
  console.log(
    `updating JSON structure for ${pageUrl} and ${anchorUrl} from ${previousUrl}`
  );
  if (!jsonData[pageUrl]) {
    jsonData[pageUrl] = {
      dateRetrieved: new Date().toISOString(),
      numberOfAccesses: 1,
      children: {},
      parents: {
        [previousUrl]: true,
      },
    };
  } else {
    jsonData[pageUrl].numberOfAccesses += 1;
    jsonData[pageUrl].dateRetrieved = new Date().toISOString();
    jsonData[pageUrl].parents[previousUrl] = true;
  }

  if (!jsonData[pageUrl].children[anchorUrl]) {
    jsonData[pageUrl].children[anchorUrl] = {
      dateRetrieved: new Date().toISOString(),
      numberOfAccesses: 1,
      parents: {
        [pageUrl]: true,
      },
    };
  } else {
    jsonData[pageUrl].children[anchorUrl].numberOfAccesses += 1;
    jsonData[pageUrl].children[anchorUrl].dateRetrieved =
      new Date().toISOString();
    jsonData[pageUrl].children[anchorUrl].parents[pageUrl] = true;
  }
}
// Crawler
async function crawl(nextUrl, previousUrl) {
  console.log(`crawling ${nextUrl} from ${previousUrl}`);
  if (
    nextUrl &&
    !visitedUrls.has(nextUrl) &&
    (await isAllowedByRobots(nextUrl))
  ) {
    visitedUrls.add(nextUrl);
    // Minimum 2 seconds delay plus some random jitter up to 3 seconds
    const delay = 3000 + Math.floor(Math.random() * 7000);
    setTimeout(() => {
      myEmitter.emit("processWebpage", nextUrl, previousUrl);
    }, delay);
  }
}

// Function to write to JSON file
function writeToJson(data) {
  console.log("writing to JSON file");
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

// Check robots.txt
async function isAllowedByRobots(urlString) {
  try {
    console.log(`checking robots.txt for ${urlString}`);
    const urlObj = new URL(urlString);
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
    console.log(`robotsUrl: ${robotsUrl}`);
    if (!robotsTxtCache.has(robotsUrl)) {
      try {
        const robotsTxt = await fetch(robotsUrl).text();
        const robots = robotsParser(robotsUrl, robotsTxt);
        robotsTxtCache.set(robotsUrl, robots);
      } catch (error) {
        return true; // If robots.txt is not found, proceed with crawling
      }
    }
    console.log(`robotsTxtCache URL: ${robotsTxtCache.has(robotsUrl)}`);

    const robots = robotsTxtCache.get(robotsUrl);
    console.log(`isAllowed: ${robots.isAllowed(urlString, "MyWebCrawlerBot")}`);
    return robots.isAllowed(urlString, "MyWebCrawlerBot");
  } catch (error) {
    console.error(
      `Error checking robots.txt for ${urlString}: ${error.message}`
    );
    return true;
  }
}

// Download images and save to a directory
async function downloadImage(url) {
  const hash = crypto.createHash("md5").update(url).digest("hex");
  const filePath = path.join(__dirname, "downloaded_images", hash);

  const file = fs.createWriteStream(filePath);
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(filePath);
        });
      })
      .on("error", (err) => {
        fs.unlink(filePath);
        reject(err.message);
      });
  });
}

// Update JSON structure to include image file paths
function updateJsonStructureForImages(pageUrl, imageUrl, filePath) {
  if (!jsonData[pageUrl]) {
    jsonData[pageUrl] = {
      dateRetrieved: new Date().toISOString(),
      numberOfAccesses: 1,
      anchors: {},
      images: {},
    };
  }

  jsonData[pageUrl].images[imageUrl] = filePath;
}

// Start the program
main("https://en.wikipedia.org/wiki/Main_Page");
