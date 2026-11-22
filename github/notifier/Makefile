NPM := npm
NPX := npx

.PHONY: setup
setup:
	@$(NPM) ci

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

# Node.js の型の除去では、拡張子のない import と、import type でない型の import を解決できないため、esbuild でまとめてから動かす
.PHONY: test
test:
	@$(NPX) esbuild index.test.ts --bundle --platform=node --sourcemap --log-level=warning --outfile=build/index.test.js
	@node --enable-source-maps --test build/index.test.js
