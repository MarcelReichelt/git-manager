# Replace an older registry file without copying its rows

An older registry file is replaced with an empty registry, and its rows are not copied. The file is older when its `repositories` table is not `path` and `display_name`; copying its `name` values was rejected because the extra columns blocked adding a registered repository. A registered repository is only a path and a display name, so those repositories are added again.
