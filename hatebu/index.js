console.info("Loading function");

const MY_ACCESS_TOKEN = process.env.MY_ACCESS_TOKEN;

const TWITTER_API_KEY = process.env.TWITTER_API_KEY;
const TWITTER_API_SECRET_KEY = process.env.TWITTER_API_SECRET_KEY;
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN;
const TWITTER_ACCESS_TOKEN_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET;

const Twitter = require("twitter");
const TwitterClient = new Twitter({
  consumer_key: TWITTER_API_KEY,
  consumer_secret: TWITTER_API_SECRET_KEY,
  access_token_key: TWITTER_ACCESS_TOKEN,
  access_token_secret: TWITTER_ACCESS_TOKEN_SECRET,
});

exports.handler = (event, context, callback) => {
  console.log("event ->", JSON.stringify(event).replace(MY_ACCESS_TOKEN, "********"));
  console.log("context ->", JSON.stringify(context));

  // eventBody is string which is the following format.
  //
  // accessToken: {{AccessToken}}
  // entryAuthor: {{EntryAuthor}}
  // entryTitle: {{EntryTitle}}
  // entryUrl: {{EntryUrl}}
  // entryContent: {{EntryContent}}
  const eventBody = event.body;

  const accessToken = getAccessToken(eventBody);
  if (accessToken != MY_ACCESS_TOKEN) {
    console.error(`Invalid token ${accessToken}`);
    return;
  }

  const entryAuthor = getEntryAuthor(eventBody);
  console.log(`entryAuthor: ${entryAuthor}`);

  const entryTitle = getEntryTitle(eventBody);
  console.log(`entryTitle: ${entryTitle}`);

  const entryUrl = getEntryUrl(eventBody);
  console.log(`entryUrl: ${entryUrl}`);

  const hatebuComment = getHatebuComment(eventBody);
  console.log(`hatebuComment: ${hatebuComment}`);

  TwitterClient.post("statuses/update", {
    status: `[B!] id:${entryAuthor} ${hatebuComment} > ${entryTitle} ${entryUrl}`,
  }).then((response) => {
    console.info("response ->", JSON.stringify(response));
    callback(null, "Just tweeted!");
  }).catch((error) => {
    console.error("error ->", JSON.stringify(error));
    callback(null, "Failed to tweet...");
  });
};

const getAccessToken = (eventBody) => {
  return eventBody.match(/^accessToken: (.+)/)[1];
};

const getEntryAuthor = (eventBody) => {
  return getEntrySafely(eventBody, "entryAuthor");
};

const getEntryTitle = (eventBody) => {
  return getEntrySafely(eventBody, "entryTitle");
};

const getEntryUrl = (eventBody) => {
  return getEntrySafely(eventBody, "entryUrl");
};

const getEntryContent = (eventBody) => {
  return getEntrySafely(eventBody, "entryContent");
};

const getEntrySafely = (eventBody, key) => {
  // It may contain line breaks.
  const regexp = new RegExp(`\n${key}: (.+)`, "s");
  return eventBody.match(regexp)[1].replace(/\n/g, "");
};

const getHatebuComment = (eventBody) => {
  const entryContent = getEntryContent(eventBody);
  console.log(`entryContent: ${entryContent}`);

  if (/<\/a> <\/p>$/.test(entryContent)) {
    return "";
  }

  return entryContent.match(/<\/a> (.+)<\/p>$/)[1];
};
