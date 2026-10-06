"""Shared label definitions for the cloud-type classifier."""

CLASSES = ["cirrus", "cumulus", "stratus", "cumulonimbus", "clear"]

# CCSN's 11 WMO genera folders, mapped onto our 5 classes.
# Ac (altocumulus) and As (altostratus) don't have a clean home: Ac is heap-shaped
# so it goes with cumulus, As is a layer so it goes with stratus, but both are
# visually closer to "textured mid cloud" than either target class -- noisiest
# part of this mapping. Ct (contrails) is thin and high like cirrus but linear,
# not wispy; included for coverage, flagged as the weakest mapping.
CCSN_TO_FIVE = {
    "Ci": "cirrus",
    "Cs": "cirrus",
    "Cc": "cirrus",
    "Ct": "cirrus",
    "Ac": "cumulus",
    "Cu": "cumulus",
    "Cb": "cumulonimbus",
    "As": "stratus",
    "Ns": "stratus",
    "Sc": "stratus",
    "St": "stratus",
}

# CCSN has no "clear" genus. We rely on /data/extra/clear/ (public clear-sky
# crops the user supplies) or a separate small public clear-sky dataset;
# download_data.py warns loudly if neither is found.
CCSN_MISSING_CLASSES = {"clear"}
