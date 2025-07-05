NPM := npm
NPX := npx

.PHONY: setup
setup:
	@$(NPM) install

.PHONY: fmt-eslint
fmt-eslint:
	@$(NPX) eslint --fix .

.PHONY: lint
lint: lint-eslint lint-tsc

.PHONY: lint-eslint
lint-eslint:
	@$(NPX) eslint .

.PHONY: lint-tsc
lint-tsc:
	@$(NPX) tsc --noEmit
