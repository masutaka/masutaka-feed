AWS := aws
MAKE := make
SAM := sam
STACK_NAME := masutaka-feed

.PHONY: setup
setup:
	@$(MAKE) -w -C github setup
	@$(MAKE) -w -C github/subscriber setup
	@$(MAKE) -w -C hatebu setup
	@$(MAKE) -w -C hatebu/subscriber setup

.PHONY: fmt-eslint
fmt-eslint:
	@$(MAKE) -w -C github fmt-eslint
	@$(MAKE) -w -C github/subscriber fmt-eslint
	@$(MAKE) -w -C hatebu fmt-eslint
	@$(MAKE) -w -C hatebu/subscriber fmt-eslint

.PHONY: lint
lint:
	@$(MAKE) -w -C github lint
	@$(MAKE) -w -C github/subscriber lint
	@$(MAKE) -w -C hatebu lint
	@$(MAKE) -w -C hatebu/subscriber lint

.PHONY: lint-eslint
lint-eslint:
	@$(MAKE) -w -C github lint-eslint
	@$(MAKE) -w -C github/subscriber lint-eslint
	@$(MAKE) -w -C hatebu lint-eslint
	@$(MAKE) -w -C hatebu/subscriber lint-eslint

.PHONY: lint-tsc
lint-tsc:
	@$(MAKE) -w -C github lint-tsc
	@$(MAKE) -w -C github/subscriber lint-tsc
	@$(MAKE) -w -C hatebu lint-tsc
	@$(MAKE) -w -C hatebu/subscriber lint-tsc

.PHONY: build
build:
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
		MastodonAccessToken=$$MASTODON_ACCESS_TOKEN \
		GitHubFeedUrl=$$GITHUB_FEED_URL \
		HatebuFeedUrl=$$HATEBU_FEED_URL

# .PHONY: destroy
# destroy:
# 	@$(AWS) cloudformation delete-stack --stack-name $(STACK_NAME)
