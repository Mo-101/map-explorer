"""Three namespaces, not three spellings of one name.

A field crosses three vocabularies on its way from NOMADS to the model, and
they are owned by different parties who change them independently::

    NomadsVariable        what you ASK NCEP's filter service for   (HGT, TMP)
    DecodedGribVariable   what ecCodes/cfgrib REPORTS back         (gh, t)
    GraphCastVariable     what the checkpoint EXPECTS              (geopotential)

Treating these as aliases works right up until a GRIB edition, a decoder
release or a provider changes one of them, at which point a single flat
dictionary silently maps the wrong field. Translation is therefore explicit and
one-directional, and every hop is a lookup that can fail loudly.

The conversion between the second and third namespace is not only a rename:
``gh`` is geopotential *height* in gpm and ``geopotential`` is m^2 s^-2. The
unit transform lives with the translation, not somewhere downstream.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from canonical import G0


class VocabularyError(Exception):
    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class VocabularyCode:
    UNKNOWN_TERM = "UNKNOWN_TERM"
    NO_TRANSLATION = "NO_TRANSLATION"


class NomadsVariable:
    """NCEP filter-service request vocabulary (GRIB2 abbreviations)."""

    TMP = "TMP"
    HGT = "HGT"
    UGRD = "UGRD"
    VGRD = "VGRD"
    VVEL = "VVEL"
    SPFH = "SPFH"
    PRMSL = "PRMSL"

    ALL = (TMP, HGT, UGRD, VGRD, VVEL, SPFH, PRMSL)


class DecodedGribVariable:
    """What cfgrib/ecCodes reports after decoding. Not the request names."""

    t = "t"
    gh = "gh"
    u = "u"
    v = "v"
    w = "w"
    q = "q"
    prmsl = "prmsl"
    t2m = "t2m"
    u10 = "u10"
    v10 = "v10"

    ALL = (t, gh, u, v, w, q, prmsl, t2m, u10, v10)


class GraphCastVariable:
    """Checkpoint vocabulary. Defined by TaskConfig, not by us."""

    temperature = "temperature"
    geopotential = "geopotential"
    u_component_of_wind = "u_component_of_wind"
    v_component_of_wind = "v_component_of_wind"
    vertical_velocity = "vertical_velocity"
    specific_humidity = "specific_humidity"
    mean_sea_level_pressure = "mean_sea_level_pressure"
    t2m = "2m_temperature"
    u10 = "10m_u_component_of_wind"
    v10 = "10m_v_component_of_wind"

    ALL = (
        temperature, geopotential, u_component_of_wind, v_component_of_wind,
        vertical_velocity, specific_humidity, mean_sea_level_pressure,
        t2m, u10, v10,
    )


def _identity(x):
    return x


def _height_to_geopotential(x):
    return x * G0


@dataclass(frozen=True)
class Translation:
    """One hop across two namespaces, with any unit transform attached."""

    decoded: str
    graphcast: str
    from_units: str
    to_units: str
    transform: Callable = _identity

    @property
    def is_pure_rename(self) -> bool:
        return self.transform is _identity


# Decoded -> GraphCast. The only place the two are related.
TRANSLATIONS: tuple[Translation, ...] = (
    Translation(DecodedGribVariable.t, GraphCastVariable.temperature, "K", "K"),
    # The one hop that is not a rename.
    Translation(
        DecodedGribVariable.gh, GraphCastVariable.geopotential,
        "gpm", "m**2 s**-2", _height_to_geopotential,
    ),
    Translation(DecodedGribVariable.u, GraphCastVariable.u_component_of_wind, "m s**-1", "m s**-1"),
    Translation(DecodedGribVariable.v, GraphCastVariable.v_component_of_wind, "m s**-1", "m s**-1"),
    Translation(DecodedGribVariable.w, GraphCastVariable.vertical_velocity, "Pa s**-1", "Pa s**-1"),
    Translation(DecodedGribVariable.q, GraphCastVariable.specific_humidity, "kg kg**-1", "kg kg**-1"),
    Translation(DecodedGribVariable.prmsl, GraphCastVariable.mean_sea_level_pressure, "Pa", "Pa"),
    Translation(DecodedGribVariable.t2m, GraphCastVariable.t2m, "K", "K"),
    Translation(DecodedGribVariable.u10, GraphCastVariable.u10, "m s**-1", "m s**-1"),
    Translation(DecodedGribVariable.v10, GraphCastVariable.v10, "m s**-1", "m s**-1"),
)

# Request -> decoded is a *separate* hop and deliberately not merged with the
# above. NOMADS returns several decoded fields per requested name (HGT yields gh
# at every selected level), so this is one-to-many and carries no units.
NOMADS_TO_DECODED: dict[str, tuple[str, ...]] = {
    NomadsVariable.TMP: (DecodedGribVariable.t, DecodedGribVariable.t2m),
    NomadsVariable.HGT: (DecodedGribVariable.gh,),
    NomadsVariable.UGRD: (DecodedGribVariable.u, DecodedGribVariable.u10),
    NomadsVariable.VGRD: (DecodedGribVariable.v, DecodedGribVariable.v10),
    NomadsVariable.VVEL: (DecodedGribVariable.w,),
    NomadsVariable.SPFH: (DecodedGribVariable.q,),
    NomadsVariable.PRMSL: (DecodedGribVariable.prmsl,),
}

_BY_DECODED = {t.decoded: t for t in TRANSLATIONS}
_BY_GRAPHCAST = {t.graphcast: t for t in TRANSLATIONS}


def translate(decoded_name: str) -> Translation:
    """Decoded -> GraphCast. Raises rather than guessing."""
    try:
        return _BY_DECODED[decoded_name]
    except KeyError:
        raise VocabularyError(
            VocabularyCode.NO_TRANSLATION,
            f"no GraphCast translation for decoded field {decoded_name!r}. "
            "Add it explicitly; do not assume the names correspond.",
        ) from None


def decoded_for(graphcast_name: str) -> str:
    try:
        return _BY_GRAPHCAST[graphcast_name].decoded
    except KeyError:
        raise VocabularyError(
            VocabularyCode.NO_TRANSLATION,
            f"no decoded source known for GraphCast variable {graphcast_name!r}",
        ) from None


def decoded_for_request(nomads_name: str) -> tuple[str, ...]:
    try:
        return NOMADS_TO_DECODED[nomads_name]
    except KeyError:
        raise VocabularyError(
            VocabularyCode.UNKNOWN_TERM,
            f"{nomads_name!r} is not a known NOMADS request term",
        ) from None


def assert_namespaces_disjoint() -> None:
    """The namespaces must not be casually interchangeable.

    Guards against someone "simplifying" the three classes into one by making
    the spellings collide.
    """
    nomads = set(NomadsVariable.ALL)
    decoded = set(DecodedGribVariable.ALL)
    if nomads & decoded:
        raise VocabularyError(
            VocabularyCode.UNKNOWN_TERM,
            f"request and decoded vocabularies overlap: {sorted(nomads & decoded)}",
        )
