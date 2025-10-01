#!/usr/bin/env python3
"""Extract structured data from the "Famille Herbaut" PDF chronicle.

The extractor relies on pdfplumber to read the textual contents and then
attempts to parse each individual sheet ("fiche individu") into a structured
representation. The resulting JSON document is written to
``data/famille-herbaut.json`` and contains two top-level arrays:

* ``individuals``: normalized individual records with stable identifiers.
* ``relationships``: spouse and parent-child relationships referencing the
  same identifiers.

The parser is heuristic based because the PDF comes from a typeset genealogy
booklet. It focuses on the following pieces of information when available:

* Name, sosa number and generation indicator.
* Birth and death dates/places.
* Parent names.
* Spouses with marriage dates/places.
* Children listed in the couple section, leveraging the identifiers that
  appear between parenthesis.

The output is deterministic as long as the input PDF is not modified.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "Famille Herbaut.pdf"
OUTPUT_PATH = ROOT / "data" / "famille-herbaut.json"

ENTRY_HEADER = re.compile(r"^(?:(?P<number>\d+(?:\.\d+)*)(?: - Sosa : (?P<sosa>[\d\s]+))?|Sosa : (?P<root_sosa>[\d\s]+))$")
BULLET_CHILD = re.compile(r"^- (?P<name>.+?) \((?P<identifier>[\d\.]+)\)")
PARENT_LINE = re.compile(
  r"^(Il|Elle) est l'enfant légitime de (?P<father>[^,]+?)(?:, [^,]+)? et de (?P<mother>[^.,]+)(?:, [^.]+)?\."
)
BIRTH_LINE = re.compile(r"est n[ée] le (?P<date>[^à]+) à (?P<place>[^.]+)")
DEATH_LINE = re.compile(r"meurt le (?P<date>[^,]+)(?: à (?P<place>[^,]+))?")
MARRIAGE_LINE = re.compile(
  r"(?P<prefix>A une date non connue, )?(Il|Elle) épouse (?P<name>[^,]+?)(?:, [^l]+)?(?: le (?P<date>[^à.]+?))(?: à (?P<place>[^.]+))?\."
)
NAME_FROM_UNKNOWN = re.compile(r"^La date de naissance de (?P<name>.+?) n'est pas connue")
NAME_FROM_UNKNOWN_DEATH = re.compile(r"^La date de décès de (?P<name>.+?) n'est pas connue")


def normalize_identifier(raw: Optional[str], fallback_prefix: str, index: int) -> str:
  """Produce a stable identifier for an entry."""
  if raw:
    normalized = raw.replace(" ", "").replace(".", "_")
    return f"I_{normalized}"
  digits = fallback_prefix.replace(" ", "")
  if digits:
    return f"S_{digits}"
  return f"AUTO_{index:04d}"


def slugify(value: str) -> str:
  value = unicodedata.normalize("NFKD", value)
  value = "".join(ch for ch in value if ch.isalnum() or ch in {" ", "-", "_"})
  value = value.replace(" ", "_").replace("-", "_")
  value = re.sub(r"_+", "_", value)
  return value.strip("_").lower() or "anonymous"


@dataclass
class Spouse:
  name: str
  marriage_date: Optional[str] = None
  marriage_place: Optional[str] = None
  note: Optional[str] = None
  partner_id: Optional[str] = None


@dataclass
class Individual:
  identifier: str
  name: str
  gender: Optional[str] = None
  generation: Optional[str] = None
  sosa: Optional[str] = None
  birth_date: Optional[str] = None
  birth_place: Optional[str] = None
  death_date: Optional[str] = None
  death_place: Optional[str] = None
  father_name: Optional[str] = None
  mother_name: Optional[str] = None
  spouses: List[Spouse] = field(default_factory=list)
  child_refs: List[str] = field(default_factory=list)
  annotations: List[str] = field(default_factory=list)

  def to_json(self) -> Dict[str, object]:
    return {
      "id": self.identifier,
      "name": self.name,
      "gender": self.gender,
      "generation": self.generation,
      "sosa": self.sosa,
      "birth": {
        "date": self.birth_date,
        "place": self.birth_place,
      } if self.birth_date or self.birth_place else None,
      "death": {
        "date": self.death_date,
        "place": self.death_place,
      } if self.death_date or self.death_place else None,
      "parents": {
        "father": self.father_name,
        "mother": self.mother_name,
      } if self.father_name or self.mother_name else None,
      "spouses": [
        {
          "name": spouse.name,
          "marriage_date": spouse.marriage_date,
          "marriage_place": spouse.marriage_place,
          "partner_id": spouse.partner_id,
          "note": spouse.note,
        }
        for spouse in self.spouses
      ] or None,
      "children": self.child_refs or None,
      "annotations": self.annotations or None,
    }


@dataclass
class Relationship:
  type: str
  source: str
  target: str
  context: Optional[str] = None

  def to_json(self) -> Dict[str, object]:
    return {
      "type": self.type,
      "source": self.source,
      "target": self.target,
      "context": self.context,
    }


def extract_entries(lines: Iterable[str]) -> List[Dict[str, object]]:
  entries: List[Dict[str, object]] = []
  current: Optional[Dict[str, object]] = None
  generation: Optional[str] = None

  def flush() -> None:
    nonlocal current
    if current:
      current.setdefault("raw_lines", [])
      entries.append(current)
      current = None

  for raw_line in lines:
    line = raw_line.strip()
    if not line:
      continue
    if line.startswith("Génération"):
      generation = line.split(maxsplit=1)[1]
      continue
    header_match = ENTRY_HEADER.match(line)
    if header_match:
      flush()
      number = header_match.group("number")
      sosa = header_match.group("sosa")
      root_sosa = header_match.group("root_sosa")
      current = {
        "identifier": number,
        "sosa": sosa or root_sosa,
        "generation": generation,
        "raw_lines": [],
      }
      continue
    if current is None:
      current = {
        "identifier": None,
        "sosa": None,
        "generation": generation,
        "raw_lines": [],
      }
    current["raw_lines"].append(line)
  flush()
  return entries


def parse_individual(entry: Dict[str, object], index: int) -> Individual:
  raw_lines: List[str] = entry.get("raw_lines", [])  # type: ignore[assignment]
  generation = entry.get("generation")  # type: ignore[assignment]
  sosa = entry.get("sosa")  # type: ignore[assignment]
  identifier = normalize_identifier(entry.get("identifier"), sosa or "", index)
  name: Optional[str] = None
  gender: Optional[str] = None
  birth_date: Optional[str] = None
  birth_place: Optional[str] = None
  death_date: Optional[str] = None
  death_place: Optional[str] = None
  father_name: Optional[str] = None
  mother_name: Optional[str] = None
  spouses: List[Spouse] = []
  child_refs: List[str] = []
  annotations: List[str] = []

  for line in raw_lines:
    if not name:
      match_birth = re.search(r"^([A-Za-zÀ-ÖØ-öø-ÿ' \-]+) est n", line)
      if match_birth:
        name = match_birth.group(1).strip()
        gender = "F" if " est née " in line else "M"
        birth_info = BIRTH_LINE.search(line)
        if birth_info:
          birth_date = birth_info.group("date").strip()
          birth_place = birth_info.group("place").strip()
        continue
      match_unknown = NAME_FROM_UNKNOWN.match(line)
      if match_unknown:
        name = match_unknown.group("name").strip()
        gender = "F" if name.endswith("e") else None
        annotations.append(line)
        continue
      match_unknown_death = NAME_FROM_UNKNOWN_DEATH.match(line)
      if match_unknown_death:
        name = match_unknown_death.group("name").strip()
        annotations.append(line)
        continue
    if " est n" in line and not birth_date:
      birth_info = BIRTH_LINE.search(line)
      if birth_info:
        birth_date = birth_info.group("date").strip()
        birth_place = birth_info.group("place").strip()
        continue
    if "meurt le" in line:
      death_info = DEATH_LINE.search(line)
      if death_info:
        death_date = death_info.group("date").strip()
        place = death_info.group("place")
        if place:
          death_place = place.strip()
      annotations.append(line)
      continue
    parent_info = PARENT_LINE.match(line)
    if parent_info:
      father_name = parent_info.group("father").strip()
      mother_name = parent_info.group("mother").strip()
      annotations.append(line)
      continue
    marriage_info = MARRIAGE_LINE.search(line)
    if marriage_info:
      spouse_name = marriage_info.group("name").strip()
      marriage_date = marriage_info.group("date")
      if marriage_date:
        marriage_date = marriage_date.strip()
      marriage_place = marriage_info.group("place")
      if marriage_place:
        marriage_place = marriage_place.strip()
      note = line
      spouses.append(
        Spouse(
          name=spouse_name,
          marriage_date=marriage_date,
          marriage_place=marriage_place,
          note=note,
        )
      )
      continue
    bullet = BULLET_CHILD.match(line)
    if bullet:
      child_refs.append(bullet.group("identifier"))
      annotations.append(line)
      continue
    if line.startswith("-"):
      annotations.append(line)
      continue
    if line and line[0].isupper():
      annotations.append(line)
      continue
    annotations.append(line)

  if not name:
    name = f"Personne {identifier}"
  return Individual(
    identifier=identifier,
    name=name,
    gender=gender,
    generation=generation,
    sosa=sosa.strip() if isinstance(sosa, str) else None,
    birth_date=birth_date,
    birth_place=birth_place,
    death_date=death_date,
    death_place=death_place,
    father_name=father_name,
    mother_name=mother_name,
    spouses=spouses,
    child_refs=child_refs,
    annotations=annotations,
  )


def load_pdf_lines(pdf_path: Path) -> List[str]:
  lines: List[str] = []
  with pdfplumber.open(pdf_path) as pdf:
    for page in pdf.pages:
      text = page.extract_text() or ""
      lines.extend(text.splitlines())
  return lines


def build_relationships(individuals: Dict[str, Individual]) -> List[Relationship]:
  relationships: List[Relationship] = []
  name_to_ids: Dict[str, List[str]] = {}
  for individual in individuals.values():
    key = slugify(individual.name)
    name_to_ids.setdefault(key, []).append(individual.identifier)

  for person in individuals.values():
    for spouse in person.spouses:
      candidate_ids = name_to_ids.get(slugify(spouse.name), [])
      partner_id: Optional[str] = None
      for candidate in candidate_ids:
        if candidate != person.identifier:
          partner_id = candidate
          break
      if not partner_id:
        partner_id = f"EXT_{slugify(spouse.name)}"
        if partner_id not in individuals:
          individuals[partner_id] = Individual(
            identifier=partner_id,
            name=spouse.name,
            annotations=[spouse.note] if spouse.note else [],
          )
      spouse.partner_id = partner_id
      relationships.append(
        Relationship(
          type="spouse",
          source=person.identifier,
          target=partner_id,
          context=spouse.note,
        )
      )
    for child_ref in person.child_refs:
      child_id = f"I_{child_ref.replace('.', '_')}"
      if child_id in individuals:
        relationships.append(
          Relationship(
            type="parent-child",
            source=person.identifier,
            target=child_id,
            context="listed child",
          )
        )
  return relationships


def export_to_json(individuals: Dict[str, Individual], relationships: List[Relationship], output_path: Path) -> None:
  payload = {
    "individuals": [individual.to_json() for individual in individuals.values()],
    "relationships": [rel.to_json() for rel in relationships],
  }
  output_path.parent.mkdir(parents=True, exist_ok=True)
  with output_path.open("w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, indent=2)


def main() -> None:
  if not PDF_PATH.exists():
    raise SystemExit(f"PDF introuvable : {PDF_PATH}")
  lines = load_pdf_lines(PDF_PATH)
  entries = extract_entries(lines)
  individuals: Dict[str, Individual] = {}
  for idx, entry in enumerate(entries):
    person = parse_individual(entry, idx)
    individuals[person.identifier] = person
  relationships = build_relationships(individuals)
  export_to_json(individuals, relationships, OUTPUT_PATH)
  print(f"Extraction terminée : {len(individuals)} individus, {len(relationships)} relations")


if __name__ == "__main__":
  main()
