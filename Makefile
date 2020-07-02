STACK_NAME := masutaka-feed

.PHONY: build
build:
	@sam build

.PHONY: deploy
deploy: build
	@sam deploy --parameter-overrides \
		GithubMyAccessToken=$$GITHUB_MY_ACCESS_TOKEN \
		HatebuMyAccessToken=$$HATEBU_MY_ACCESS_TOKEN \
		PushoverAppToken=$$PUSHOVER_APP_TOKEN \
		PushoverUserKey=$$PUSHOVER_USER_KEY \
		TwitterAccessToken=$$TWITTER_ACCESS_TOKEN \
		TwitterAccessTokenSecret=$$TWITTER_ACCESS_TOKEN_SECRET \
		TwitterApiKey=$$TWITTER_API_KEY \
		TwitterApiSecretKey=$$TWITTER_API_SECRET_KEY

.PHONY: destroy
destroy:
	@aws cloudformation delete-stack --stack-name $(STACK_NAME)
