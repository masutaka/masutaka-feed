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

  const eventBody = JSON.parse(event.body);

  if (eventBody.accessToken != MY_ACCESS_TOKEN) {
    console.error(`Invalid token ${eventBody.accessToken}`);
    return;
  }

  TwitterClient.post("statuses/update", {
    status: `[B!] ${eventBody.entryAuthor} > ${eventBody.entryTitle} ${eventBody.entryUrl}`,
  }).then((response) => {
    console.info("response ->", JSON.stringify(response));
    callback(null, "Just tweeted!");
  }).catch((error) => {
    console.error("error ->", JSON.stringify(error));
    callback(null, "Failed to tweet...");
  });
};
