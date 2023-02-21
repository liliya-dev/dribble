const schedule = require("node-schedule");
const { MongoClient } = require("mongodb");
const { parse } = require("node-html-parser");
const fetch = require("node-fetch");
require("dotenv").config();
const puppeteer = require("puppeteer");
const logger = require("pino")();

async function getParsedDaraFromBRowser() {
  const browser = await puppeteer.launch({
    headless: true,
    slowMo: 250,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  }); // for test disable the headlels mode,
  const page = await browser.newPage();
  await page.goto("https://dribbble.com/shots/popular", {
    waitUntil: "networkidle2",
  });
  await autoScroll(page);

  const html = await page.evaluate(() => document.querySelector("*").outerHTML);
  const root = parse(html);
  const items = root.querySelectorAll(".shot-thumbnail-container");
  const info = items.map((item, index) => {
    const company = item.querySelector(".display-name").childNodes[0]._rawText;
    const views = item.querySelector(".js-shot-views-count");
    const viewsCount = views ? views.childNodes[0]._rawText : undefined;
    const likes = item.querySelector(".js-shot-likes-count");
    const likesCount = likes ? likes.childNodes[0]._rawText : undefined;
    const title = item.querySelector(".shot-title");
    const titleProcessed = title ? title.childNodes[0]._rawText : "boosted";
    const image = item.querySelector(
      ".js-thumbnail-placeholder.shot-thumbnail-placeholder > img"
    );
    const imageSrc = image && image._attrs ? image._attrs.src : null;
    
    return {
      company,
      viewsCount,
      likesCount,
      i: index + 1,
      id: item._attrs["data-thumbnail-id"],
      title: titleProcessed,
      imageSrc,
    };
  });
  const time = Date.now();

  browser.close();
  return { info, time };
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        let scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

const putNewValuesToDatabase = async ({ info, time }) => {
  console.log({info, time})
  try {
    const client = new MongoClient(encodeURI(process.env.MONGO_URI), {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await client.connect();
    const database = client.db(process.env.MONGO_DATABASE_NAME);
    const collection = database.collection("shots");

    for (let j = 0; j < info.length; j++) {
      const { viewsCount, likesCount, i, id, title, imageSrc } = info[j];

      const cursorFrom = await collection.find({ id });
      const selectedDataFrom = await cursorFrom.toArray();
      if (selectedDataFrom.length === 0) {
        const { published_at } = await getShotPublishInfo({ id });
        logger.info({ published_at });
        const c = await collection.insertOne({
          id,
          title,
          published_at,
          imageSrc,
          shots: [{ position: i, likesCount, viewsCount, time }],
        });
        console.log('created', c)

      } else {
        const c = await collection.updateOne(
          { id },
          {
            $set: {
              shots: [
                ...selectedDataFrom[0].shots,
                { position: i, likesCount, viewsCount, time },
              ],
            },
          }
        );
        console.log('updated', c)
      }
    }

    client.close();
  } catch (error) {
    logger.error(error);
  }
};

schedule.scheduleJob("*/2 * * * *", async function () {
  logger.info("Job started");
  const { time, info } = await getParsedDaraFromBRowser();
  console.log(info.map(item => item.company))
  const regex = new RegExp("Halo Lab", "gim");
  const haloInfo = info.filter((item) => regex.test(item.company));
  console.log({haloInfo})

  const haloInfoProcessed = haloInfo.map((item) => {
    const viewsNumberK = item.viewsCount.split("k")[0];
    const viewsNumber =
      viewsNumberK.length === item.viewsCount.length
        ? +viewsNumberK
        : +viewsNumberK * 1000;
    return {
      ...item,
      viewsCount: viewsNumber,
    };
  });
  logger.info(`Items to process: ${haloInfo.length}`);
  if (haloInfo.length === 0) return;
  await putNewValuesToDatabase({ info: haloInfoProcessed, time });
});

const getShotPublishInfo = async ({ id }) => {
  const sendRequestDribble = async ({ page, per_page }) => {
    const response = await fetch(
      `${process.env.DRIBBBLE_API_ENDPOINT}/user/shots?page=${page}&per_page=${per_page}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.DRIBBBLE_TOKEN}`,
        },
      }
    );
    const shotsList = await response.json();
    const shot = shotsList.find((shot) => `${shot.id}` === `${id}`);
    if (!shot) {
      return { shot: null, shotsLength: shotsList.length };
    } else {
      return { shot };
    }
  };

  let published_at = 0;
  let stopped = false;
  const perPage = 100;
  let pageCounter = 1;

  while (!stopped) {
    let { shot, shotsLength } = await sendRequestDribble({
      page: pageCounter,
      per_page: perPage,
    });
    if (shot) {
      published_at = shot.published_at;
      stopped = true;
    } else {
      if (shotsLength < perPage) {
        stopped = true;
      } else {
        pageCounter = pageCounter + 1;
      }
    }
  }

  return { published_at, pageCounter };
};
