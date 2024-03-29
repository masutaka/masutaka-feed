AWS := aws
MAKE := make
SAM := sam
STACK_NAME := masutaka-feed

.PHONY: build
build: github hatebu
	@$(SAM) build

.PHONY: deploy
deploy: build
	@$(SAM) deploy --no-confirm-changeset --no-fail-on-empty-changeset --parameter-overrides \
		GithubMyAccessToken=$$GH_MY_ACCESS_TOKEN \
		GithubTitleIgnoreRegexp=$$GH_TITLE_IGNORE_REGEXP \
		GithubTitlePushoverRegexp=$$GH_TITLE_PUSHOVER_REGEXP \
		HatebuMyAccessToken=$$HATEBU_MY_ACCESS_TOKEN \
		PushoverAppToken=$$PUSHOVER_APP_TOKEN \
		PushoverUserKey=$$PUSHOVER_USER_KEY \
		MastodonUrl=$$MASTODON_URL \
		MastodonAccessToken=$$MASTODON_ACCESS_TOKEN

# .PHONY: destroy
# destroy:
# 	@$(AWS) cloudformation delete-stack --stack-name $(STACK_NAME)

.PHONY: github
github:
	@$(MAKE) -w -C github

.PHONY: hatebu
hatebu:
	@$(MAKE) -w -C hatebu
