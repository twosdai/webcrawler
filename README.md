# Webcrawler

Just a simple webcrawler program

## Install

To install you will need NPM and node 18.x
`npm ci`

## Running the program

`node ./webcrawler.js` If running from the root of the repository.

## Why this program what does it do?

I wrote this program as a simple single threaded application which can build in memory a map of the web. It starts at wikipedia and branches outwards. For every change to the map of the web it writes the result to disk via the `data.json` file. If you were to start the application over the file gets overriden. Additionally images are attempted to be downloaded and stored under the `downloaded_images` folder

To change the starting webpage, alter the `webcrawler.js` main function call at the bottom of the file

## Known Issues

Image downloading doesn't really work very well, and many images fail to download.
