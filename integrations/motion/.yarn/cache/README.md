This folder normally holds Yarn Berry's vendored package archives (~270MB of
.zip files) for "zero-install" builds. It was intentionally left out of this
merge to keep the delivered project a reasonable size — it's fully
regenerable and adds no functional capability by itself (same reason
node_modules/ is never shipped in this project). Run `yarn install` inside
integrations/motion/ (with internet access) to repopulate it if you need to
build/test the Motion library itself.
