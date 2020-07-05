console.info("Loading function");

const MY_ACCESS_TOKEN = process.env.MY_ACCESS_TOKEN;

const TWITTER_API_KEY = process.env.TWITTER_API_KEY;
const TWITTER_API_SECRET_KEY = process.env.TWITTER_API_SECRET_KEY;
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN;
const TWITTER_ACCESS_TOKEN_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET;

const PUSHOVER_USER_KEY = process.env.PUSHOVER_USER_KEY;
const PUSHOVER_APP_TOKEN = process.env.PUSHOVER_APP_TOKEN;

const Twitter = require("twitter");
const TwitterClient = new Twitter({
  consumer_key: TWITTER_API_KEY,
  consumer_secret: TWITTER_API_SECRET_KEY,
  access_token_key: TWITTER_ACCESS_TOKEN,
  access_token_secret: TWITTER_ACCESS_TOKEN_SECRET,
});

const Pushover = require("pushover-notifications");
const PushoverClient = new Pushover({
  user: PUSHOVER_USER_KEY,
  token: PUSHOVER_APP_TOKEN,
});

const GITHUB_TITLE_IGNORE_REGEXP = /(feedforce|dependabot-preview)/;
const GITHUB_TITLE_PUSHOVER_REGEXP = /masutaka/;

exports.handler = (event, context, callback) => {
  console.log("event ->", JSON.stringify(event).replace(MY_ACCESS_TOKEN, "********"));
  console.log("context ->", JSON.stringify(context));

  const eventBody = JSON.parse(event.body);

  if (eventBody.accessToken != MY_ACCESS_TOKEN) {
    console.error(`Invalid token ${eventBody.accessToken}`);
    return;
  }

  if (GITHUB_TITLE_IGNORE_REGEXP.test(eventBody.entryTitle)) {
    console.info(`[GH] Ignore "${eventBody.entryTitle}"`);
    return;
  }

  Promise.all([githubTweet(eventBody), sendPushover(eventBody)])
    .then(([twitter, pushover]) => {
      console.info("[Twitter] response ->", JSON.stringify(twitter));
      console.info("[Pushover] response ->", JSON.stringify(pushover));
      callback(null, "Just tweeted or pushovered!");
    })
    .catch(([twitter, pushover]) => {
      console.info("[Twitter] error ->", JSON.stringify(twitter));
      console.info("[Pushover] error ->", JSON.stringify(pushover));
      callback(null, "Failed to tweet or pushover...");
    });
};

const githubTweet = (eventBody) => {
  return TwitterClient.post("statuses/update", {
    status: `[GH] ${getTitle(eventBody)} ${getMessage(eventBody)}`,
  });
};

const sendPushover = (eventBody) => {
  const title = getTitle(eventBody);
  const message = getMessage(eventBody);

  if (GITHUB_TITLE_PUSHOVER_REGEXP.test(title)) {
    return PushoverClient.send({
      title: title,
      message: message, // required
      device: "Android",
      priority: 0,      // normal
    });
  }

  return `Doesn't send to pushover because the entryTitle "${title}" doesnot match with ${GITHUB_TITLE_PUSHOVER_REGEXP}`;
};

const getTitle = (eventBody) => {
  return eventBody.entryTitle;
};

const getMessage = (eventBody) => {
  const found = eventBody.entryTitle.match(/^([^ ]+) started following/);

  if (found) {
    return `https://github.com/${found[1]}`;
  }

  return eventBody.entryUrl;
};
