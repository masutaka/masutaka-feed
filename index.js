console.info("Loading function");

const MY_ACCESS_TOKEN = process.env.MY_ACCESS_TOKEN;

const Twitter = require("twitter");
const TwitterClient = new Twitter({
  consumer_key: process.env.TWITTER_API_KEY,
  consumer_secret: process.env.TWITTER_API_SECRET_KEY,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const Pushover = require("pushover-notifications");
const PushoverClient = new Pushover({
  user: process.env.PUSHOVER_USER_KEY,
  token: process.env.PUSHOVER_APP_TOKEN,
});

const GITHUB_TITLE_IGNORE_REGEXP = /feedforce/;
const GITHUB_TITLE_PUSHOVER_REGEXP = /masutaka/;

exports.handler = (event, context, callback) => {
  const eventBody = JSON.parse(event.body);

  switch (eventBody.type) {
  case "hatebu":
    hatebu(event, context, callback);
    break;
  case "github":
    github(event, context, callback);
    break;
  default:
    console.error(`Unsupported type ${eventBody.type}`);
    break;
  }
};

const hatebu = (event, context, callback) => {
  console.log("event ->", JSON.stringify(event).replace(MY_ACCESS_TOKEN, "********"));
  console.log("context ->", JSON.stringify(context));

  const eventBody = JSON.parse(event.body);

  if (eventBody.accessToken != MY_ACCESS_TOKEN) {
    console.error(`Invalid token ${eventBody.accessToken}`);
    return;
  }

  hatebuTweet({
    status: `[B!] ${eventBody.entryAuthor} > ${eventBody.entryTitle} ${eventBody.entryUrl}`,
    callback: callback,
  });
};

const hatebuTweet = ({status = null, callback = null}) => {
  TwitterClient.post("statuses/update", { status: status })
    .then((response) => {
      console.info("response ->", JSON.stringify(response));
      callback(null, "Just tweeted!");
    })
    .catch((error) => {
      console.error("error ->", JSON.stringify(error));
      callback(null, "Failed to tweet...");
    });
};

const github = (event, context, callback) => {
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
    status: `[GH] ${getTweetTitle(eventBody)} ${getTweetMessage(eventBody)}`,
  });
};

const getTweetTitle = (eventBody) => {
  return eventBody.entryTitle;
};

const getTweetMessage = (eventBody) => {
  const found = eventBody.entryTitle.match(/^([^ ]+) started following/);

  if (found) {
    return `https://github.com/${found[1]}`;
  }

  return eventBody.entryUrl;
};

const sendPushover = (eventBody) => {
  const title = getPushoverTitle(eventBody);
  const message = getPushoverMessage(eventBody);

  if (GITHUB_TITLE_PUSHOVER_REGEXP.test(title)) {
    return PushoverClient.send({
      title: title,
      message: message, // required
      device: "iPhone",
      priority: 0,      // normal
    });
  }

  return `Doesn't send to pushover because the entryTitle "${title}" doesnot match with ${GITHUB_TITLE_PUSHOVER_REGEXP}`;
};

const getPushoverTitle = (eventBody) => {
  return eventBody.entryTitle;
};

const getPushoverMessage = (eventBody) => {
  const found = eventBody.entryTitle.match(/^([^ ]+) started following/);

  if (found) {
    return `https://github.com/${found[1]}`;
  }

  return eventBody.entryUrl;
};
