AWS := aws
MAKE := make
SAM := sam
STACK_NAME := masutaka-feed

.PHONY: build
build: github hatebu
	@$(SAM) build

.PHONY: deploy
deploy: build
	@$(SAM) deploy --parameter-overrides \
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
	@$(AWS) cloudformation delete-stack --stack-name $(STACK_NAME)

.PHONY: github
github:
	@$(MAKE) -w -C github

.PHONY: hatebu
hatebu:
	@$(MAKE) -w -C hatebu
