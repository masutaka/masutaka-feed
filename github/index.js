console.info("Loading function");

const MY_ACCESS_TOKEN = process.env.MY_ACCESS_TOKEN;

const TWITTER_API_KEY = process.env.TWITTER_API_KEY;
const TWITTER_API_SECRET_KEY = process.env.TWITTER_API_SECRET_KEY;
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN;
const TWITTER_ACCESS_TOKEN_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET;

const MASTODON_URL = process.env.MASTODON_URL;
const MASTODON_ACCESS_TOKEN = process.env.MASTODON_ACCESS_TOKEN;

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

const GITHUB_TITLE_IGNORE_REGEXP = /dependabot/;
const GITHUB_TITLE_PUSHOVER_REGEXP = /masutaka/;

exports.handler = (event, context, callback) => {
  console.log("event ->", JSON.stringify(event).replace(MY_ACCESS_TOKEN, "********"));
  console.log("context ->", JSON.stringify(context));

  // eventBody is string which is the following format.
  //
  // accessToken: {{AccessToken}}  # <= It should be first
  // entryTitle: {{EntryTitle}}
  // entryUrl: {{EntryUrl}}
  const eventBody = event.body;

  const accessToken = getAccessToken(eventBody);
  if (accessToken != MY_ACCESS_TOKEN) {
    console.error(`Invalid token ${accessToken}`);
    return;
  }

  const entryTitle = getEntryTitle(eventBody);
  console.log(`entryTitle: ${entryTitle}`);

  if (GITHUB_TITLE_IGNORE_REGEXP.test(entryTitle)) {
    console.info(`[GH] Ignore "${entryTitle}"`);
    return;
  }

  const entryUrl = getEntryUrl(eventBody);
  console.log(`entryUrl: ${entryUrl}`);

  Promise.all([postToMastodon(entryTitle, entryUrl), sendPushover(entryTitle, entryUrl)])
    .then(([mastodon, pushover]) => {
      console.info("[Mastodon] response ->", JSON.stringify(mastodon));
      console.info("[Pushover] response ->", JSON.stringify(pushover));
      callback(null, "Just posted or pushovered!");
    })
    .catch(([mastodon, pushover]) => {
      console.info("[Mastodon] error ->", JSON.stringify(mastodon));
      console.info("[Pushover] error ->", JSON.stringify(pushover));
      callback(null, "Failed to post or pushover...");
    });
};

const getAccessToken = (eventBody) => {
  return eventBody.match(/^accessToken: (.+)/)[1];
};

const getEntryTitle = (eventBody) => {
  return eventBody.match(/\nentryTitle: (.+)/)[1];
};

const getEntryUrl = (eventBody) => {
  return eventBody.match(/\nentryUrl: (.+)/)[1];
};

const githubTweet = (entryTitle, entryUrl) => {
  return TwitterClient.post("statuses/update", {
    status: `[GH] ${entryTitle} ${getMessage(entryTitle, entryUrl)}`,
  });
};

const postToMastodon = (entryTitle, entryUrl) => {
  return (async () => {
    const { login } = require("masto");
    const masto = await login({
      url: MASTODON_URL,
      accessToken: MASTODON_ACCESS_TOKEN,
    });

    return masto.v1.statuses.create({
      status: `[GH] ${entryTitle} ${getMessage(entryTitle, entryUrl)}`,
    });
  })();
};

const sendPushover = (entryTitle, entryUrl) => {
  const message = getMessage(entryTitle, entryUrl);

  if (GITHUB_TITLE_PUSHOVER_REGEXP.test(entryTitle)) {
    return PushoverClient.send({
      title: entryTitle,
      message: message, // required
      device: "Android",
      priority: 0,      // normal
      sound: "gamelan",
    });
  }

  return `Doesn't send to pushover because the entryTitle "${entryTitle}" doesnot match with ${GITHUB_TITLE_PUSHOVER_REGEXP}`;
};

const getMessage = (entryTitle, entryUrl) => {
  const found = entryTitle.match(/^([^ ]+) started following/);

  if (found) {
    return `https://github.com/${found[1]}`;
  }

  return entryUrl;
};
