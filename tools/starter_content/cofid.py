"""Small standard-library XLSX reader for the pinned CoFID source workbook."""
from __future__ import annotations

import hashlib
import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile
from decimal import Decimal, InvalidOperation

URL = "https://assets.publishing.service.gov.uk/media/60538b91e90e07527df82ae4/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx"
SHA256 = "436e9445ef2adb2a75f3d7edd51302de3adad25385f9795fc94ba58bd030e97d"
PAGE = "https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def numeric(value):
    """Unknown/trace qualifiers are not zero; preserve their source cells separately."""
    try:
        n = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return float(n.quantize(Decimal("0.000001"))) if n.is_finite() else None


def read_workbook(path):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != SHA256:
        raise ValueError(f"CoFID checksum mismatch: {digest}; review a new release explicitly")
    with zipfile.ZipFile(path) as z:
        strings = ["".join(e.itertext()) for e in ET.fromstring(z.read("xl/sharedStrings.xml"))]
        rels = {x.attrib["Id"]: x.attrib["Target"] for x in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
        sheets = ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", NS)
        out = {"_ambiguous_rows": {}}
        for sheet in sheets:
            name = sheet.attrib["name"]
            if name not in ("1.2 Factors", "1.3 Proximates"):
                continue
            target = rels[sheet.attrib[RID]]
            target = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
            root = ET.fromstring(z.read(target))
            rows, ambiguous = {}, {}
            for row in root.findall("m:sheetData/m:row", NS):
                cells = {}
                for cell in row:
                    value = cell.find("m:v", NS)
                    text = value.text if value is not None else None
                    if cell.attrib.get("t") == "s" and text is not None:
                        text = strings[int(text)]
                    elif cell.attrib.get("t") == "inlineStr":
                        text = "".join(cell.find("m:is", NS).itertext())
                    if text is not None:
                        cells[re.sub(r"\d+$", "", cell.attrib["r"])] = text
                code = cells.get("A", "")
                if re.fullmatch(r"\d{2}-\d{3,4}", code):
                    record = {"row": int(row.attrib["r"]), "cells": cells}
                    if code in ambiguous:
                        ambiguous[code].append(record)
                    elif code in rows:
                        # The official release repeats 13-669 for two different foods.
                        # Never overwrite or select an ambiguous code by accident.
                        ambiguous[code] = [rows.pop(code), record]
                    else:
                        rows[code] = record
            out[name] = rows
            out["_ambiguous_rows"][name] = ambiguous
    return out
