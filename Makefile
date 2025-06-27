AWS := aws
MAKE := make
SAM := sam
STACK_NAME := masutaka-feed

.PHONY: install
install:
	@$(MAKE) -w -C github install
	@$(MAKE) -w -C hatebu install

.PHONY: fmt-eslint
fmt-eslint:
	@$(MAKE) -w -C github fmt-eslint
	@$(MAKE) -w -C hatebu fmt-eslint

.PHONY: lint
lint:
	@$(MAKE) -w -C github lint
	@$(MAKE) -w -C hatebu lint

.PHONY: lint-eslint
lint-eslint:
	@$(MAKE) -w -C github lint-eslint
	@$(MAKE) -w -C hatebu lint-eslint

.PHONY: lint-tsc
lint-tsc:
	@$(MAKE) -w -C github lint-tsc
	@$(MAKE) -w -C hatebu lint-tsc

.PHONY: build
build: install lint
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
