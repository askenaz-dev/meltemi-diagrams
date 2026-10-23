## MODIFIED Requirements

### Requirement: SVG folder packs
A folder `assets/icons/<prefix>/` SHALL be a pack whose icons are its `.svg` files, named after the file without the extension. Every file SHALL be sanitised when the project's assets are read, using its `viewBox`, or its `width` and `height`, as the view box. A file rejected by the sanitiser SHALL be `asset.unsafe-svg` on that file. A file whose name without the extension is not a valid icon name (`[A-Za-z0-9_.-]+`) SHALL be `asset.unusable-name` (warning) on the file, with the hint naming the slug to rename it to (`slugifyIconName`: diacritics folded, runs of other characters as `-`, trimmed), SHALL not be registered, and the pack SHALL keep its other icons.

#### Scenario: Provider icons
- **WHEN** `assets/icons/aws/lambda.svg` and `assets/icons/aws/s3.svg` exist with flat colours
- **THEN** `aws:lambda` and `aws:s3` resolve, keep their colours, and are multicolour

#### Scenario: A file name that cannot be referenced
- **WHEN** `assets/icons/brand/My Logo (1).svg` and `assets/icons/brand/pin.svg` exist
- **THEN** `asset.unusable-name` is reported on the first file with the hint `My-Logo-1.svg`, `brand:pin` resolves, and no reference of the first file resolves

#### Scenario: Unsafe file
- **WHEN** `assets/icons/local/bad.svg` contains `<script>`
- **THEN** `asset.unsafe-svg` is reported on the file and `local:bad` does not resolve
