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

.PHONY: list-resources
list-resources:
	@$(SAM) list resources

REQUIRED_ENVS := GH_FEED_URL GH_TITLE_IGNORE_REGEXP GH_TITLE_PUSHOVER_REGEXP \
                 HATEBU_FEED_URL PUSHOVER_APP_TOKEN PUSHOVER_USER_KEY \
                 MASTODON_URL MASTODON_ACCESS_TOKEN

# sam deploy も各パラメータの値が空だとエラーにするが、早期検知したい意図がある
.PHONY: validate-envs
validate-envs:
	@missing_envs=""; \
	for env in $(REQUIRED_ENVS); do \
		eval "value=\$$$$env"; \
		if [ -z "$$value" ]; then \
			missing_envs="$$missing_envs $$env"; \
		fi; \
	done; \
	if [ -n "$$missing_envs" ]; then \
		echo "Error: The following environment variables are not set:" >&2; \
		for env in $$missing_envs; do \
			echo "  - $$env" >&2; \
		done; \
		exit 1; \
	fi

.PHONY: validate
validate:
	@$(SAM) validate

.PHONY: build
build: validate
	@$(SAM) build

# ローカルで誤ってデプロイしづらいようにする
DEPLOY_OPTIONS := $(if $(CI),--no-confirm-changeset,)

.PHONY: deploy
deploy: validate-envs build
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
