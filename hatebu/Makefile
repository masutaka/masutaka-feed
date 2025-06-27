NPM := npm
NPX := npx

all: typecheck

.PHONY: install
install:
	@$(NPM) install

.PHONY: typecheck
typecheck: install
	@$(NPX) tsc --noEmit

.PHONY: fmt-eslint
fmt-eslint:
	@$(NPX) eslint --fix .

.PHONY: lint-eslint
lint-eslint:
	@$(NPX) eslint .
