console.log("Loading function");

const twitter = require("twitter");

const twitter_client = new twitter({
  consumer_key: process.env.TWITTER_API_KEY,
  consumer_secret: process.env.TWITTER_API_SECRET_KEY,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const GITHUB_TITLE_IGNORE_REGEXP = /(feedforce|vim|kristofferahl|dependabot-preview)/;
const GITHUB_TITLE_PUSHOVER_REGEXP = /masutaka/;

exports.handler = (event, context, callback) => {
  console.log("event ->", JSON.stringify(event));
  console.log("context ->", JSON.stringify(context));
  console.log("callback ->", JSON.stringify(callback));

  const eventBody = JSON.parse(event.body);

  if (eventBody.accessToken != process.env.MY_ACCESS_TOKEN) {
    console.log(`Invalid token ${eventBody.accessToken}`);
    return;
  }

  // TODO: Lambda function を 2 つに分ける（masutaka-feed-hatebu & masutaka-feed-github）
  switch (eventBody.type) {
  case "hatebu":
    tweet({
      status: `[B!] ${eventBody.entryAuthor} > ${eventBody.entryTitle} ${eventBody.entryUrl}`,
      callback: callback,
    });
    break;
  case "github":
    if (GITHUB_TITLE_IGNORE_REGEXP.test(eventBody.entryTitle)) {
      console.log(`[GH] Ignore "${eventBody.entryTitle}"`);
      break;
    }

    tweet({
      status: `[GH] ${eventBody.entryTitle} ${eventBody.entryUrl}`,
      callback: callback,
    });

    if (GITHUB_TITLE_PUSHOVER_REGEXP.test(eventBody.entryTitle)) {
      // TODO: masutaka にマッチしたら Pushover に送信
      console.log(`[GH] Pushover "${eventBody.entryTitle}"`);
    }
    break;
  default:
    console.log(`Unsupported type ${eventBody.type}`);
    break;
  }
};

const tweet = ({status = null, callback = null}) => {
  twitter_client.post(
    "statuses/update",
    { status: status },
    (error, tweet, response) => {
      if(error) {
        console.log("[Error] error ->", JSON.stringify(error));
        console.log("[Error] tweet ->", JSON.stringify(tweet));
        console.log("[Error] response ->", JSON.stringify(response));
        callback(null, "Failed to tweet...");
      }
      console.log(`tweet -> ${status}`);
      callback(null, "Just tweeted!");
    }
  );
};
