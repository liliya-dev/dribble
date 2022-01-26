const schedule = require('node-schedule');
const { MongoClient } = require('mongodb');
const { parse } = require('node-html-parser');
const fetch = require('node-fetch')
require('dotenv').config();
const puppeteer = require('puppeteer');

async function getParsedDaraFromBRowser(){
    const browser = await puppeteer.launch({ headless: true, slowMo: 250, args: ['--no-sandbox', '--disable-setuid-sandbox']}); // for test disable the headlels mode,
    const page = await browser.newPage();
    await page.goto("https://dribbble.com/shots/popular",{waitUntil: 'networkidle2'});
    await autoScroll(page);

    const html = await page.evaluate(() => document.querySelector('*').outerHTML);
    const root = parse(html);
    const items = root.querySelectorAll('.shot-thumbnail-container');
    const info = items.map((item, index) => {
      const company = item.querySelector('.display-name').childNodes[0]._rawText;
      const views = item.querySelector('.js-shot-views-count');
      const viewsCount = views ? views.childNodes[0]._rawText : undefined
      const likes = item.querySelector('.js-shot-likes-count');
      const likesCount = likes ? likes.childNodes[0]._rawText : undefined
      const title = item.querySelector('.shot-title');
      const titleProcessed = title ? title.childNodes[0]._rawText : 'boosted';
      return {
        company, viewsCount, likesCount, i: index+1, id: item._attrs['data-thumbnail-id'], title: titleProcessed
      }
    })
    const time = Date.now();
    
    browser.close()
    return { info, time }
} 

async function autoScroll(page){
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
          let scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight){
            clearInterval(timer);
            resolve();
          }
      }, 100);
    });
  });
}


const putNewValuesToDatabase = async ({ info, time }) => {
  try {
    const client = new MongoClient(encodeURI(process.env.MONGO_URI), { useNewUrlParser: true , useUnifiedTopology: true });
    await client.connect();
    const database = client.db(process.env.MONGO_DATABASE_NAME);
    const collection = database.collection('shots');

    for (let j = 0; j < info.length; j++) {
      const { viewsCount, likesCount, i, id, title, } = info[j];

      const cursorFrom = await collection.find({ id });
      const selectedDataFrom = await cursorFrom.toArray();
      if (selectedDataFrom.length === 0) {
        const { published_at } = await getShotPublishInfo({ id })
        console.log({ time: Date.now(), published_at })
        await collection.insertOne({ id, title, published_at, shots: [{ position: i, likesCount, viewsCount, time }]})
      } else {
        await collection.updateOne(
          { id }, 
          { $set: { 
            shots: [...selectedDataFrom[0].shots, { position: i, likesCount, viewsCount, time }] 
          }}
        )
      }
    }

    client.close();
  } catch(error) {
    console.log(error)
  }
}

schedule.scheduleJob("*/2 * * * *",  async function(){
  const { time, info } = await getParsedDaraFromBRowser();

  const regex = new RegExp('Halo Lab', 'gim');
  const haloInfo  = info.filter(item => regex.test(item.company));
  const haloInfoProcessed  = haloInfo.map(item => {
    const viewsNumberK = item.viewsCount.split('k')[0];
    const viewsNumber = viewsNumberK.length === item.viewsCount.length ? +viewsNumberK : +viewsNumberK * 1000;
    return {
      ...item,
      viewsCount: viewsNumber
    }
  });
  if (haloInfo.length === 0) return
  await putNewValuesToDatabase({ info: haloInfoProcessed, time })
});

const getShotPublishInfo = async ({ id }) => {
  const response = await fetch('http://api.dribbble.com/v2/user/shots?page=1&per_page=100', {
    headers: {
      'Authorization': `Bearer ${process.env.DRIBBBLE_TOKEN}`
    }
  })
  const shotsList = await response.json();
  const shot = shotsList.find(shot => `${shot.id}` === `${id}`)
  // const data = await fetch('http://api.dribbble.com/v2/user/shots?page=1&per_page=100', {
  //   headers: {
  //     'Authorization': `Bearer ${process.env.DRIBBBLE_TOKEN}`
  //   }
  // }).then(response => response.json())
  //   .then(data => {
  //     const shot = shotsList.find(shot => `${shot.id}` === `${id}`)
  //   });
  return {
    published_at: shot ? shot.published_at : 0
  }
}
