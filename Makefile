AWS := aws
MAKE := make
SAM := sam
STACK_NAME := masutaka-feed

.PHONY: setup
setup:
	@$(MAKE) -w -C github/notifier setup
	@$(MAKE) -w -C github/subscriber setup
	@$(MAKE) -w -C hatebu/notifier setup
	@$(MAKE) -w -C hatebu/subscriber setup

.PHONY: fmt-eslint
fmt-eslint:
	@$(MAKE) -w -C github/notifier fmt-eslint
	@$(MAKE) -w -C github/subscriber fmt-eslint
	@$(MAKE) -w -C hatebu/notifier fmt-eslint
	@$(MAKE) -w -C hatebu/subscriber fmt-eslint

.PHONY: lint
lint:
	@$(MAKE) -w -C github/notifier lint
	@$(MAKE) -w -C github/subscriber lint
	@$(MAKE) -w -C hatebu/notifier lint
	@$(MAKE) -w -C hatebu/subscriber lint

.PHONY: lint-eslint
lint-eslint:
	@$(MAKE) -w -C github/notifier lint-eslint
	@$(MAKE) -w -C github/subscriber lint-eslint
	@$(MAKE) -w -C hatebu/notifier lint-eslint
	@$(MAKE) -w -C hatebu/subscriber lint-eslint

.PHONY: lint-tsc
lint-tsc:
	@$(MAKE) -w -C github/notifier lint-tsc
	@$(MAKE) -w -C github/subscriber lint-tsc
	@$(MAKE) -w -C hatebu/notifier lint-tsc
	@$(MAKE) -w -C hatebu/subscriber lint-tsc

.PHONY: build
build:
	@$(SAM) build

# ローカルで誤ってデプロイしづらいようにする
DEPLOY_OPTIONS := $(if $(CI),--no-confirm-changeset,)

.PHONY: deploy
deploy: build
	@$(SAM) deploy $(DEPLOY_OPTIONS) --no-fail-on-empty-changeset --parameter-overrides \
		GitHubFeedUrl=$$GH_FEED_URL \
		GithubTitleIgnoreRegexp=$$GH_TITLE_IGNORE_REGEXP \
		GithubTitlePushoverRegexp=$$GH_TITLE_PUSHOVER_REGEXP \
		HatebuFeedUrl=$$HATEBU_FEED_URL \
		PushoverAppToken=$$PUSHOVER_APP_TOKEN \
		PushoverUserKey=$$PUSHOVER_USER_KEY \
		MastodonUrl=$$MASTODON_URL \
		MastodonAccessToken=$$MASTODON_ACCESS_TOKEN

# .PHONY: destroy
# destroy:
# 	@$(AWS) cloudformation delete-stack --stack-name $(STACK_NAME)
