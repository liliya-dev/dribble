const schedule = require('node-schedule');
const fetch = require("node-fetch");
const $ = require('cheerio');
const rp = require('request-promise');
const { parse } = require('node-html-parser');

// // schedule.scheduleJob('55 * * * * *',  async function(){
// //   console.log('The answer to life, the universe, and everything!');
// //   const res = await fetch('https://dribbble.com/shots/popular')
// //   console.log(res)
// // });

// const func = async () => {
//   console.log('The answer to life, the universe, and everything!');
//   const html = await rp('https://dribbble.com/shots/popular')
//   const root = parse(html);
//   const items = root.querySelectorAll('.shot-thumbnail-container');
//   const info = items.map((item, index) => {
//     const name = item.querySelector('.display-name').childNodes[0]._rawText;
//     const views = item.querySelector('.js-shot-views-count').childNodes[0]._rawText;
//     const likes = item.querySelector('.js-shot-likes-count').childNodes[0]._rawText;
//     if (index === 2) console.log({name})
//     return {
//       name, views, likes, position: index + 1
//     }
//   })
//   console.log({info})
// }

// func()

// var newestShots = [{
  const { copyFileSync } = require('fs');
const puppeteer = require('puppeteer');
  async function getTokoPedia(){
      const browser = await puppeteer.launch({ headless: false, slowMo: 250, }); // for test disable the headlels mode,
      const page = await browser.newPage();

      // await page.setViewport({ width: 1000, height: 9926 });
      await page.goto("https://dribbble.com/shots/popular",{waitUntil: 'networkidle2'});
      await autoScroll(page);
  
      const html = await page.evaluate(() => document.querySelector('*').outerHTML);
      const root = parse(html);
      const items = root.querySelectorAll('.shot-thumbnail-container');
      const info = items.map((item, index) => {
        const name = item.querySelector('.display-name').childNodes[0]._rawText;
        const views = item.querySelector('.js-shot-views-count');
        const viewsCount = views ? views.childNodes[0]._rawText : undefined
        const likes = item.querySelector('.js-shot-likes-count');
        const likesCount = likes ? likes.childNodes[0]._rawText : undefined
        // if (index === 2) console.log({name})
        return {
          name, viewsCount, likesCount, i: index+1
        }
      })
      console.log({info})

  
      // browser.close()
  } 

  async function autoScroll(page){
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            var totalHeight = 0;
            var distance = 100;
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if(totalHeight >= scrollHeight){
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}
  
  
  getTokoPedia();