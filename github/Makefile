NPM := npm
NPX := npx

all: typecheck

.PHONY: install
install:
	@$(NPM) install

.PHONY: typecheck
typecheck: install
	@$(NPX) tsc --noEmit
