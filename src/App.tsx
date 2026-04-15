import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'

const RECORD_SCHEMA_VERSION = 1
const PARSER_VERSION = 1
const DERIVED_METRICS_VERSION = 1

type ParseSeverity = 'info' | 'warning' | 'error'
type ValueType =
  | 'string'
  | 'integer'
  | 'decimal'
  | 'currency'
  | 'suffixNumber'
  | 'duration'
  | 'multiplier'
  | 'date'

type ParseMessage = {
  severity: ParseSeverity
  message: string
}

type ParsedStat = {
  sectionOriginal: string
  sectionKey: string
  labelOriginal: string
  labelNormalized: string
  canonicalField: string | null
  rawValue: string
  valueType: ValueType
  normalizedValue: string | null
  lineIndex: number
}

type RoundSummary = {
  tier: number | null
  wave: number | null
  killedBy: string | null
  gameTimeRaw: string | null
  gameTimeSeconds: number | null
  realTimeRaw: string | null
  realTimeSeconds: number | null
  coinsEarnedRaw: string | null
  coinsEarnedNormalized: string | null
  coinsPerHourReportedRaw: string | null
  coinsPerHourReportedNormalized: string | null
  cashEarnedRaw: string | null
  cashEarnedNormalized: string | null
  cellsEarnedRaw: string | null
  cellsEarnedNormalized: string | null
  rerollShardsEarnedRaw: string | null
  rerollShardsEarnedNormalized: string | null
  deathDefy: number | null
  wavesSkipped: number | null
  coinsFromDeathWaveRaw: string | null
  coinsFromDeathWaveNormalized: string | null
  coinsFromGoldenTowerRaw: string | null
  coinsFromGoldenTowerNormalized: string | null
  coinsFromBlackHoleRaw: string | null
  coinsFromBlackHoleNormalized: string | null
  coinsFromSpotlightRaw: string | null
  coinsFromSpotlightNormalized: string | null
  coinsFromCoinUpgradeRaw: string | null
  coinsFromCoinUpgradeNormalized: string | null
  coinsFromCoinBonusesRaw: string | null
  coinsFromCoinBonusesNormalized: string | null
  guardianSummonedEnemiesRaw: string | null
  guardianSummonedEnemiesNormalized: string | null
  guardianCoinsStolenRaw: string | null
  guardianCoinsStolenNormalized: string | null
  coinsFetchedRaw: string | null
  coinsFetchedNormalized: string | null
  gemsRaw: string | null
  gemsNormalized: string | null
  medalsRaw: string | null
  medalsNormalized: string | null
  rerollShardsFetchedRaw: string | null
  rerollShardsFetchedNormalized: string | null
  cannonShardsRaw: string | null
  cannonShardsNormalized: string | null
  armorShardsRaw: string | null
  armorShardsNormalized: string | null
  generatorShardsRaw: string | null
  generatorShardsNormalized: string | null
  coreShardsRaw: string | null
  coreShardsNormalized: string | null
  commonModulesRaw: string | null
  commonModulesNormalized: string | null
  rareModulesRaw: string | null
  rareModulesNormalized: string | null

  startTimeRaw: string | null
  endTimeRaw: string | null

  differenceRaw: string | null
  differenceSeconds: number | null

  upTimePctRaw: string | null
  upTimePctValue: number | null

  dayUpPctRaw: string | null
  dayUpPctValue: number | null

  dayDownRaw: string | null
  dayDownValue: number | null

  totalUpPctRaw: string | null
  totalUpPctValue: number | null

  daysSinceRaw: string | null
  daysSinceValue: number | null
}

type RoundDerivedMetrics = {
  speed: string | null
  realTimeHours: string | null
  wavesPerHour: string | null
  wavesSkippedPct: string | null
  coinsPerHourComputed: string | null
  cashPerHour: string | null
  cellsPerHour: string | null
  rerollShardsPerHour: string | null
  coinsFromDeathWavePerHour: string | null
  coinsFromGoldenTowerPerHour: string | null
  coinsFromBlackHolePerHour: string | null
  coinsFromSpotlightPerHour: string | null
  coinsFromCoinUpgradePerHour: string | null
  coinsFromCoinBonusesPerHour: string | null
  summonedEnemiesPerHour: string | null
  guardianCoinsStolenPerHour: string | null
  coinsFetchedPerHour: string | null
}

type RoundRecord = {
  id: string
  schemaVersion: number
  sourceFormatVersion: 1 | 2 | null
  parserVersion: number
  derivedMetricsVersion: number
  createdAtUtc: string
  updatedAtUtc: string
  importTimezone: string
  rawReportText: string
  rawReportHash: string
  probableDuplicateFingerprint: string
  isPartial: boolean
  warnings: ParseMessage[]
  errors: ParseMessage[]
  unparsedLines: string[]
  battleDateRaw: string | null
  battleDateLocal: string | null
  battleDateUtc: string | null
  summary: RoundSummary
  derived: RoundDerivedMetrics
  stats: ParsedStat[]
}

type ParseResult = {
  record: RoundRecord | null
  previewSummary: string[]
  saveable: boolean
}

type ImportPayload = {
  exportedAt: string
  schemaVersion: number
  parserVersion: number
  derivedMetricsVersion: number
  rounds: RoundRecord[]
}

type ColumnDef = {
  key: string
  label: string
  group: 'default' | 'optional'
  getValue: (round: RoundRecord) => string
  sortValue: (round: RoundRecord) => string | number
}

const DB_NAME = 'tower-battle-report-db'
const DB_VERSION = 1
const STORE_NAME = 'rounds'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (): void => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('battleDateUtc', 'battleDateUtc', { unique: false })
        store.createIndex('rawReportHash', 'rawReportHash', { unique: false })
      }
    }
    request.onsuccess = (): void => resolve(request.result)
    request.onerror = (): void => reject(request.error)
  })
}

async function saveRound(record: RoundRecord): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record)
    tx.oncomplete = (): void => resolve()
    tx.onerror = (): void => reject(tx.error)
  })
  db.close()
}

async function getAllRounds(): Promise<RoundRecord[]> {
  const db = await openDb()
  const rows = await new Promise<RoundRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = (): void =>
      resolve((request.result as RoundRecord[]) || [])
    request.onerror = (): void => reject(request.error)
  })
  db.close()
  return rows
}

async function deleteRound(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = (): void => resolve()
    tx.onerror = (): void => reject(tx.error)
  })
  db.close()
}

async function saveManyRounds(records: RoundRecord[]): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    records.forEach((record: RoundRecord): void => {
      store.put(record)
    })
    tx.oncomplete = (): void => resolve()
    tx.onerror = (): void => reject(tx.error)
  })
  db.close()
}

function generateId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text)
  const buffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buffer))
    .map((b: number): string => b.toString(16).padStart(2, '0'))
    .join('')
}

function normalizeLabelToSnakeCase(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return [hrs, mins, secs]
    .map((n: number): string => String(n).padStart(2, '0'))
    .join(':')
}

function formatLocalDate(
  iso: string | null,
  fallbackRaw: string | null,
): string {
  if (!iso) return fallbackRaw || '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return fallbackRaw || '—'
  return date.toLocaleString()
}

function formatPercent(value: string | null): string {
  if (!value) return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return `${num.toFixed(2)}%`
}

function formatSpeed(value: string | null): string {
  if (!value) return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return `${num.toFixed(2)}x`
}

const SUFFIX_ORDER = [
  '',
  'K',
  'M',
  'B',
  'T',
  'q',
  'Q',
  's',
  'S',
  'O',
  'N',
  'D',
  'aa',
  'ab',
  'ac',
  'ad',
  'ae',
  'af',
  'ag',
  'ah',
  'ai',
  'aj',
  'ak',
  'al',
  'am',
  'an',
  'ao',
  'ap',
  'aq',
  'ar',
  'as',
  'at',
  'au',
  'av',
  'aw',
  'ax',
  'ay',
  'az',
]

const SUFFIX_TO_EXPONENT: Record<string, number> = SUFFIX_ORDER.reduce(
  (
    acc: Record<string, number>,
    suffix: string,
    index: number,
  ): Record<string, number> => {
    acc[suffix] = index * 3
    return acc
  },
  {},
)

function multiplyDecimalStringByPowerOfTen(
  value: string,
  exponent: number,
): string {
  const clean = value.replace(/,/g, '').trim()
  if (!/^\d+(\.\d+)?$/.test(clean)) return clean
  const [whole, frac = ''] = clean.split('.')
  const digits = `${whole}${frac}`.replace(/^0+(?=\d)/, '') || '0'
  const decimalPlaces = frac.length
  const shift = exponent - decimalPlaces
  if (shift >= 0)
    return `${digits}${'0'.repeat(shift)}`.replace(/^0+(?=\d)/, '') || '0'
  const splitIndex = digits.length + shift
  if (splitIndex > 0) {
    return `${digits.slice(0, splitIndex)}.${digits.slice(splitIndex)}`.replace(
      /\.0+$/,
      '',
    )
  }
  return `0.${'0'.repeat(Math.abs(splitIndex))}${digits}`
    .replace(/0+$/, '')
    .replace(/\.$/, '')
}

function divideDecimalStringStrings(
  numerator: string,
  denominator: number,
): string | null {
  const num = Number(numerator)
  if (
    !Number.isFinite(num) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  )
    return null
  return String(num / denominator)
}

function abbreviateFromNumericString(
  value: string | null,
  currency = false,
): string {
  if (!value) return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  const abs = Math.abs(num)
  let suffixIndex = 0
  while (
    suffixIndex + 1 < SUFFIX_ORDER.length &&
    abs >= 1000 ** (suffixIndex + 1)
  )
    suffixIndex += 1
  const scaled = num / 1000 ** suffixIndex
  return `${currency ? '$' : ''}${scaled.toFixed(2)}${SUFFIX_ORDER[suffixIndex]}`
}

function parseDurationToSeconds(raw: string): number | null {
  const match = raw.trim().match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/i)
  if (!match) return null
  const hours = Number(match[1] || 0)
  const minutes = Number(match[2] || 0)
  const seconds = Number(match[3] || 0)
  if (
    [hours, minutes, seconds].some((value: number): boolean =>
      Number.isNaN(value),
    )
  )
    return null
  return hours * 3600 + minutes * 60 + seconds
}

function parseBattleDate(raw: string): {
  local: string | null
  utc: string | null
} {
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return { local: null, utc: null }
  const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
  return { local, utc: date.toISOString() }
}

function classifyValue(rawValue: string, labelOriginal: string): ValueType {
  if (
    /^\$?[\d,.]+(?:[KMBTqQsSOND]|aa|ab|ac|ad|ae|af|ag|ah|ai|aj|ak|al|am|an|ao|ap|aq|ar|as|at|au|av|aw|ax|ay|az)?$/i.test(
      rawValue,
    )
  ) {
    return rawValue.startsWith('$') ? 'currency' : 'suffixNumber'
  }
  if (/^x\d+(\.\d+)?$/i.test(rawValue)) return 'multiplier'
  if (/\d+h|\d+m|\d+s/i.test(rawValue)) return 'duration'
  if (/date/i.test(labelOriginal)) return 'date'
  if (/^\d+$/.test(rawValue.replace(/,/g, ''))) return 'integer'
  if (/^\d+\.\d+$/.test(rawValue.replace(/,/g, ''))) return 'decimal'
  return 'string'
}

function parseNormalizedValue(
  rawValue: string,
  valueType: ValueType,
): string | null {
  const trimmed = rawValue.trim()
  if (valueType === 'duration') {
    const seconds = parseDurationToSeconds(trimmed)
    return seconds === null ? null : String(seconds)
  }
  if (valueType === 'multiplier') return trimmed.replace(/^x/i, '')
  if (valueType === 'integer' || valueType === 'decimal') {
    const clean = trimmed.replace(/,/g, '')
    return /^\d+(\.\d+)?$/.test(clean) ? clean : null
  }
  if (valueType === 'currency' || valueType === 'suffixNumber') {
    const clean = trimmed.replace(/^\$/, '').replace(/,/g, '')
    const match = clean.match(
      /^(\d+(?:\.\d+)?)(K|M|B|T|q|Q|s|S|O|N|D|aa|ab|ac|ad|ae|af|ag|ah|ai|aj|ak|al|am|an|ao|ap|aq|ar|as|at|au|av|aw|ax|ay|az)?$/,
    )
    if (!match) return null
    const suffix = match[2] || ''
    if (!(suffix in SUFFIX_TO_EXPONENT)) return null
    return multiplyDecimalStringByPowerOfTen(
      match[1],
      SUFFIX_TO_EXPONENT[suffix],
    )
  }
  return null
}

function defaultSummary(): RoundSummary {
  return {
    tier: null,
    wave: null,
    killedBy: null,
    gameTimeRaw: null,
    gameTimeSeconds: null,
    realTimeRaw: null,
    realTimeSeconds: null,
    coinsEarnedRaw: null,
    coinsEarnedNormalized: null,
    coinsPerHourReportedRaw: null,
    coinsPerHourReportedNormalized: null,
    cashEarnedRaw: null,
    cashEarnedNormalized: null,
    cellsEarnedRaw: null,
    cellsEarnedNormalized: null,
    rerollShardsEarnedRaw: null,
    rerollShardsEarnedNormalized: null,
    deathDefy: null,
    wavesSkipped: null,
    coinsFromDeathWaveRaw: null,
    coinsFromDeathWaveNormalized: null,
    coinsFromGoldenTowerRaw: null,
    coinsFromGoldenTowerNormalized: null,
    coinsFromBlackHoleRaw: null,
    coinsFromBlackHoleNormalized: null,
    coinsFromSpotlightRaw: null,
    coinsFromSpotlightNormalized: null,
    coinsFromCoinUpgradeRaw: null,
    coinsFromCoinUpgradeNormalized: null,
    coinsFromCoinBonusesRaw: null,
    coinsFromCoinBonusesNormalized: null,
    guardianSummonedEnemiesRaw: null,
    guardianSummonedEnemiesNormalized: null,
    guardianCoinsStolenRaw: null,
    guardianCoinsStolenNormalized: null,
    coinsFetchedRaw: null,
    coinsFetchedNormalized: null,
    gemsRaw: null,
    gemsNormalized: null,
    medalsRaw: null,
    medalsNormalized: null,
    rerollShardsFetchedRaw: null,
    rerollShardsFetchedNormalized: null,
    cannonShardsRaw: null,
    cannonShardsNormalized: null,
    armorShardsRaw: null,
    armorShardsNormalized: null,
    generatorShardsRaw: null,
    generatorShardsNormalized: null,
    coreShardsRaw: null,
    coreShardsNormalized: null,
    commonModulesRaw: null,
    commonModulesNormalized: null,
    rareModulesRaw: null,
    rareModulesNormalized: null,

    startTimeRaw: null,
    endTimeRaw: null,

    differenceRaw: null,
    differenceSeconds: null,

    upTimePctRaw: null,
    upTimePctValue: null,

    dayUpPctRaw: null,
    dayUpPctValue: null,

    dayDownRaw: null,
    dayDownValue: null,

    totalUpPctRaw: null,
    totalUpPctValue: null,

    daysSinceRaw: null,
    daysSinceValue: null,
  }
}

function defaultDerived(): RoundDerivedMetrics {
  return {
    speed: null,
    realTimeHours: null,
    wavesPerHour: null,
    wavesSkippedPct: null,
    coinsPerHourComputed: null,
    cashPerHour: null,
    cellsPerHour: null,
    rerollShardsPerHour: null,
    coinsFromDeathWavePerHour: null,
    coinsFromGoldenTowerPerHour: null,
    coinsFromBlackHolePerHour: null,
    coinsFromSpotlightPerHour: null,
    coinsFromCoinUpgradePerHour: null,
    coinsFromCoinBonusesPerHour: null,
    summonedEnemiesPerHour: null,
    guardianCoinsStolenPerHour: null,
    coinsFetchedPerHour: null,
  }
}

const CANONICAL_FIELD_MAP: Record<
  string,
  keyof RoundSummary | 'battleDateRaw'
> = {
  battle_date: 'battleDateRaw',
  tier: 'tier',
  wave: 'wave',
  killed_by: 'killedBy',
  game_time: 'gameTimeRaw',
  real_time: 'realTimeRaw',
  coins_earned: 'coinsEarnedRaw',
  coins_per_hour: 'coinsPerHourReportedRaw',
  cash_earned: 'cashEarnedRaw',
  cells_earned: 'cellsEarnedRaw',
  reroll_shards_earned: 'rerollShardsEarnedRaw',
  death_defy: 'deathDefy',
  waves_skipped: 'wavesSkipped',
  coins_from_death_wave: 'coinsFromDeathWaveRaw',
  coins_from_golden_tower: 'coinsFromGoldenTowerRaw',
  coins_from_black_hole: 'coinsFromBlackHoleRaw',
  coins_from_spotlight: 'coinsFromSpotlightRaw',
  coins_from_coin_upgrade: 'coinsFromCoinUpgradeRaw',
  coins_from_coin_bonuses: 'coinsFromCoinBonusesRaw',
  summoned_enemies: 'guardianSummonedEnemiesRaw',
  guardian_coins_stolen: 'guardianCoinsStolenRaw',
  coins_fetched: 'coinsFetchedRaw',
  gems: 'gemsRaw',
  medals: 'medalsRaw',
  reroll_shards_fetched: 'rerollShardsFetchedRaw',
  cannon_shards: 'cannonShardsRaw',
  armor_shards: 'armorShardsRaw',
  generator_shards: 'generatorShardsRaw',
  core_shards: 'coreShardsRaw',
  common_modules: 'commonModulesRaw',
  rare_modules: 'rareModulesRaw',

  start_time: 'startTimeRaw',
  end_time: 'endTimeRaw',
  difference: 'differenceRaw',
  up_time: 'upTimePctRaw',
  up_time_pct: 'upTimePctRaw',
  day_up: 'dayUpPctRaw',
  day_up_pct: 'dayUpPctRaw',
  day_down: 'dayDownRaw',
  total_up: 'totalUpPctRaw',
  total_up_pct: 'totalUpPctRaw',
  days_since: 'daysSinceRaw',
}

const V2_CANONICAL_FIELD_MAP: Record<
  string,
  keyof RoundSummary | 'battleDateRaw'
> = {
  'battle_report.battle_date': 'battleDateRaw',
  'battle_report.game_time': 'gameTimeRaw',
  'battle_report.real_time': 'realTimeRaw',
  'battle_report.tier': 'tier',
  'battle_report.wave': 'wave',
  'battle_report.killed_by': 'killedBy',
  'battle_report.coins_earned': 'coinsEarnedRaw',
  'battle_report.coins_per_hour': 'coinsPerHourReportedRaw',
  'battle_report.cells_earned': 'cellsEarnedRaw',
  // 'battle_report.cells_per_hour': 'cellsEarnedRaw',
  // 'battle_report.cells_per_hour': 'cellsPerHourReportedRaw',
  'counts.waves_skipped': 'wavesSkipped',
  'counts.death_defy': 'deathDefy',
  'coins.golden_tower': 'coinsFromGoldenTowerRaw',
  'coins.death_wave': 'coinsFromDeathWaveRaw',
  'coins.spotlight': 'coinsFromSpotlightRaw',
  'coins.black_hole': 'coinsFromBlackHoleRaw',
  'coins.coin_bonus_upgrade': 'coinsFromCoinUpgradeRaw',
  'coins.coins_from_coin_bonuses': 'coinsFromCoinBonusesRaw',
  'coins.coins_fetched': 'coinsFetchedRaw',
  'cash.cash_earned': 'cashEarnedRaw',
  'currencies.cells_earned': 'cellsEarnedRaw',
  'currencies.reroll_shards_earned': 'rerollShardsEarnedRaw',
  'currencies.gems': 'gemsRaw',
  'currencies.medals': 'medalsRaw',
  'currencies.reroll_shards_fetched': 'rerollShardsFetchedRaw',
  'currencies.cannon_shards': 'cannonShardsRaw',
  'currencies.armor_shards': 'armorShardsRaw',
  'currencies.generator_shards': 'generatorShardsRaw',
  'currencies.core_shards': 'coreShardsRaw',
  'currencies.common_modules': 'commonModulesRaw',
  'currencies.rare_modules': 'rareModulesRaw',
  'total_enemies.summoned_enemies': 'guardianSummonedEnemiesRaw',
}

const SECTION_NAMES = new Set([
  'battle report',
  'combat',
  'utility',
  'enemies destroyed',
  'bots',
  'guardian',
  'records',
  'damage',
  'damage taken',
  'bonus health gained',
  'health regenerated',
  'damage blocked',
  'counts',
  'enemies hit by',
  'killed with effect active',
  'total enemies',
  'coins',
  'cash',
  'currencies',
  'enemies destroyed by',
])

const SECTION_LABEL_FIELD_MAP: Record<
  string,
  Record<string, keyof RoundSummary | 'battleDateRaw'>
> = {
  battle_report: {
    coins_earned: 'coinsEarnedRaw',
    coins_per_hour: 'coinsPerHourReportedRaw',
    cells_earned: 'cellsEarnedRaw',
    cells_per_hour: 'cellsEarnedRaw',
    reroll_shards_earned: 'rerollShardsEarnedRaw',
    cash_earned: 'cashEarnedRaw',
    death_defy: 'deathDefy',
    waves_skipped: 'wavesSkipped',
  },
  utility: {
    coins_from_death_wave: 'coinsFromDeathWaveRaw',
    coins_from_golden_tower: 'coinsFromGoldenTowerRaw',
    coins_from_black_hole: 'coinsFromBlackHoleRaw',
    coins_from_spotlight: 'coinsFromSpotlightRaw',
    coins_from_coin_upgrade: 'coinsFromCoinUpgradeRaw',
    coins_from_coin_bonuses: 'coinsFromCoinBonusesRaw',
  },
  guardian: {
    summoned_enemies: 'guardianSummonedEnemiesRaw',
    guardian_coins_stolen: 'guardianCoinsStolenRaw',
    coins_fetched: 'coinsFetchedRaw',
    gems: 'gemsRaw',
    medals: 'medalsRaw',
    reroll_shards_fetched: 'rerollShardsFetchedRaw',
    cannon_shards: 'cannonShardsRaw',
    armor_shards: 'armorShardsRaw',
    generator_shards: 'generatorShardsRaw',
    core_shards: 'coreShardsRaw',
    common_modules: 'commonModulesRaw',
    rare_modules: 'rareModulesRaw',
  },
  coins: {
    coins_earned: 'coinsEarnedRaw',
    coin_bonus_upgrade: 'coinsFromCoinUpgradeRaw',
    coins_from_coin_bonuses: 'coinsFromCoinBonusesRaw',
    golden_tower: 'coinsFromGoldenTowerRaw',
    death_wave: 'coinsFromDeathWaveRaw',
    spotlight: 'coinsFromSpotlightRaw',
    black_hole: 'coinsFromBlackHoleRaw',
    coins_fetched: 'coinsFetchedRaw',
  },
  cash: {
    cash_earned: 'cashEarnedRaw',
  },
  currencies: {
    cells_earned: 'cellsEarnedRaw',
    reroll_shards_earned: 'rerollShardsEarnedRaw',
    gems: 'gemsRaw',
    medals: 'medalsRaw',
    reroll_shards_fetched: 'rerollShardsFetchedRaw',
    cannon_shards: 'cannonShardsRaw',
    armor_shards: 'armorShardsRaw',
    generator_shards: 'generatorShardsRaw',
    core_shards: 'coreShardsRaw',
    common_modules: 'commonModulesRaw',
    rare_modules: 'rareModulesRaw',
  },
  total_enemies: {
    summoned_enemies: 'guardianSummonedEnemiesRaw',
  },
}

const NORMALIZED_VALUE_FIELD_MAP: Record<string, keyof RoundSummary> = {
  coinsEarnedRaw: 'coinsEarnedNormalized',
  coinsPerHourReportedRaw: 'coinsPerHourReportedNormalized',
  cashEarnedRaw: 'cashEarnedNormalized',
  cellsEarnedRaw: 'cellsEarnedNormalized',
  rerollShardsEarnedRaw: 'rerollShardsEarnedNormalized',
  coinsFromDeathWaveRaw: 'coinsFromDeathWaveNormalized',
  coinsFromGoldenTowerRaw: 'coinsFromGoldenTowerNormalized',
  coinsFromBlackHoleRaw: 'coinsFromBlackHoleNormalized',
  coinsFromSpotlightRaw: 'coinsFromSpotlightNormalized',
  coinsFromCoinUpgradeRaw: 'coinsFromCoinUpgradeNormalized',
  coinsFromCoinBonusesRaw: 'coinsFromCoinBonusesNormalized',
  guardianSummonedEnemiesRaw: 'guardianSummonedEnemiesNormalized',
  guardianCoinsStolenRaw: 'guardianCoinsStolenNormalized',
  coinsFetchedRaw: 'coinsFetchedNormalized',
  gemsRaw: 'gemsNormalized',
  medalsRaw: 'medalsNormalized',
  rerollShardsFetchedRaw: 'rerollShardsFetchedNormalized',
  cannonShardsRaw: 'cannonShardsNormalized',
  armorShardsRaw: 'armorShardsNormalized',
  generatorShardsRaw: 'generatorShardsNormalized',
  coreShardsRaw: 'coreShardsNormalized',
  commonModulesRaw: 'commonModulesNormalized',
  rareModulesRaw: 'rareModulesNormalized',
}

const DURATION_VALUE_FIELD_MAP: Record<string, keyof RoundSummary> = {
  gameTimeRaw: 'gameTimeSeconds',
  realTimeRaw: 'realTimeSeconds',
  differenceRaw: 'differenceSeconds',
}

const PERCENT_VALUE_FIELD_MAP: Record<string, keyof RoundSummary> = {
  upTimePctRaw: 'upTimePctValue',
  dayUpPctRaw: 'dayUpPctValue',
  totalUpPctRaw: 'totalUpPctValue',
}

const INTEGER_VALUE_FIELD_MAP: Record<string, keyof RoundSummary> = {
  dayDownRaw: 'dayDownValue',
  daysSinceRaw: 'daysSinceValue',
}

function getCanonicalField(
  sectionKey: string,
  labelNormalized: string,
): keyof RoundSummary | 'battleDateRaw' | null {
  const sectionMap = SECTION_LABEL_FIELD_MAP[sectionKey]
  if (sectionMap && labelNormalized in sectionMap) {
    return sectionMap[labelNormalized]
  }

  return CANONICAL_FIELD_MAP[labelNormalized] || null
}

function parseLooseNumber(rawValue: string): number | null {
  const clean = rawValue.replace(/[%,$]/g, '').replace(/,/g, '').trim()
  if (!clean) return null

  const normalized = parseNormalizedValue(clean, classifyValue(clean, clean))
  const candidate = normalized || clean
  const num = Number(candidate)
  return Number.isFinite(num) ? num : null
}

function assignSummaryFieldV1(
  summary: RoundSummary,
  mappedField: keyof RoundSummary | 'battleDateRaw' | null,
  rawValue: string,
  normalizedValue: string | null,
  valueType: ValueType,
): { battleDateRaw: string | null } {
  let battleDateRaw: string | null = null
  if (!mappedField) return { battleDateRaw }
  if (mappedField === 'battleDateRaw') return { battleDateRaw: rawValue }

  if (
    mappedField === 'tier' ||
    mappedField === 'wave' ||
    mappedField === 'deathDefy' ||
    mappedField === 'wavesSkipped'
  ) {
    const num = Number((normalizedValue || rawValue).replace(/,/g, ''))
    ;(summary[mappedField] as number | null) = Number.isFinite(num) ? num : null
    return { battleDateRaw }
  }

  ;(summary[mappedField] as string | null) = rawValue

  if (mappedField in NORMALIZED_VALUE_FIELD_MAP) {
    const mirrorField = NORMALIZED_VALUE_FIELD_MAP[mappedField]
    ;(summary[mirrorField] as string | null) = normalizedValue
  }

  if (mappedField in DURATION_VALUE_FIELD_MAP) {
    const mirrorField = DURATION_VALUE_FIELD_MAP[mappedField]
    ;(summary[mirrorField] as number | null) =
      valueType === 'duration' && normalizedValue
        ? Number(normalizedValue)
        : null
  }

  if (mappedField in PERCENT_VALUE_FIELD_MAP) {
    const mirrorField = PERCENT_VALUE_FIELD_MAP[mappedField]
    ;(summary[mirrorField] as number | null) = parseLooseNumber(rawValue)
  }

  if (mappedField in INTEGER_VALUE_FIELD_MAP) {
    const mirrorField = INTEGER_VALUE_FIELD_MAP[mappedField]
    ;(summary[mirrorField] as number | null) = parseLooseNumber(rawValue)
  }

  return { battleDateRaw }
}

function assignSummaryFieldV2(
  summary: RoundSummary,
  mappedField: keyof RoundSummary | 'battleDateRaw' | null,
  rawValue: string,
  normalizedValue: string | null,
  valueType: ValueType,
): { battleDateRaw: string | null } {
  let battleDateRaw: string | null = null
  if (!mappedField) return { battleDateRaw }
  if (mappedField === 'battleDateRaw') return { battleDateRaw: rawValue }

  if (
    mappedField === 'tier' ||
    mappedField === 'wave' ||
    mappedField === 'deathDefy' ||
    mappedField === 'wavesSkipped'
  ) {
    const num = Number((normalizedValue || rawValue).replace(/,/g, ''))
    ;(summary[mappedField] as number | null) = Number.isFinite(num) ? num : null
    return { battleDateRaw }
  }

  ;(summary[mappedField] as string | null) = rawValue

  if (mappedField in NORMALIZED_VALUE_FIELD_MAP) {
    const mirrorField = NORMALIZED_VALUE_FIELD_MAP[mappedField]
    ;(summary[mirrorField] as string | null) = normalizedValue
  }

  if (mappedField in DURATION_VALUE_FIELD_MAP) {
    const mirrorField = DURATION_VALUE_FIELD_MAP[mappedField]
    ;(summary[mirrorField] as number | null) =
      valueType === 'duration' && normalizedValue
        ? Number(normalizedValue)
        : null
  }

  if (mappedField in PERCENT_VALUE_FIELD_MAP) {
    const mirrorField = PERCENT_VALUE_FIELD_MAP[mappedField]
    ;(summary[mirrorField] as number | null) = parseLooseNumber(rawValue)
  }

  if (mappedField in INTEGER_VALUE_FIELD_MAP) {
    const mirrorField = INTEGER_VALUE_FIELD_MAP[mappedField]
    ;(summary[mirrorField] as number | null) = parseLooseNumber(rawValue)
  }

  return { battleDateRaw }
}

function computeDerived(summary: RoundSummary): RoundDerivedMetrics {
  const derived = defaultDerived()
  const realTimeSeconds = summary.realTimeSeconds
  const realTimeHours =
    realTimeSeconds && realTimeSeconds > 0 ? realTimeSeconds / 3600 : null
  const gameTimeSeconds = summary.gameTimeSeconds
  if (realTimeHours !== null) derived.realTimeHours = String(realTimeHours)
  if (realTimeSeconds && gameTimeSeconds)
    derived.speed = String(gameTimeSeconds / realTimeSeconds)
  if (summary.wave !== null && realTimeHours)
    derived.wavesPerHour = String(summary.wave / realTimeHours)
  if (summary.wavesSkipped !== null && summary.wave && summary.wave > 0) {
    derived.wavesSkippedPct = String(
      (summary.wavesSkipped / summary.wave) * 100,
    )
  }
  const perHour = (value: string | null): string | null => {
    if (!value || !realTimeHours || realTimeHours === 0) return null
    return divideDecimalStringStrings(value, realTimeHours)
  }
  derived.coinsPerHourComputed = perHour(summary.coinsEarnedNormalized)
  derived.cashPerHour = perHour(summary.cashEarnedNormalized)
  derived.cellsPerHour = perHour(summary.cellsEarnedNormalized)
  derived.rerollShardsPerHour = perHour(summary.rerollShardsEarnedNormalized)
  derived.coinsFromDeathWavePerHour = perHour(
    summary.coinsFromDeathWaveNormalized,
  )
  derived.coinsFromGoldenTowerPerHour = perHour(
    summary.coinsFromGoldenTowerNormalized,
  )
  derived.coinsFromBlackHolePerHour = perHour(
    summary.coinsFromBlackHoleNormalized,
  )
  derived.coinsFromSpotlightPerHour = perHour(
    summary.coinsFromSpotlightNormalized,
  )
  derived.coinsFromCoinUpgradePerHour = perHour(
    summary.coinsFromCoinUpgradeNormalized,
  )
  derived.coinsFromCoinBonusesPerHour = perHour(
    summary.coinsFromCoinBonusesNormalized,
  )
  derived.summonedEnemiesPerHour = perHour(
    summary.guardianSummonedEnemiesNormalized,
  )
  derived.guardianCoinsStolenPerHour = perHour(
    summary.guardianCoinsStolenNormalized,
  )
  derived.coinsFetchedPerHour = perHour(summary.coinsFetchedNormalized)
  return derived
}

function buildFingerprint(
  summary: RoundSummary,
  battleDateRaw: string | null,
): string {
  return [
    battleDateRaw || '',
    summary.tier || '',
    summary.wave || '',
    summary.gameTimeRaw || '',
    summary.realTimeRaw || '',
  ].join('|')
}

const HEATMAP_COLUMN_KEYS: Set<string> = new Set([
  'coinsPerHour',
  'cellsPerHour',
  'rerollShardsPerHour',
  'coinsFromDeathWavePerHour',
  'coinsFromGoldenTowerPerHour',
  'coinsFromBlackHolePerHour',
  'coinsFromSpotlightPerHour',
  'coinsFromCoinUpgradePerHour',
  'coinsFromCoinBonusesPerHour',
  'summonedEnemiesPerHour',
  'guardianCoinsStolenPerHour',
  'coinsFetchedPerHour',
  'wavesSkippedPct',
])

function getHeatmapNumericValue(
  round: RoundRecord,
  columnKey: string,
): number | null {
  switch (columnKey) {
    case 'coinsPerHour':
      return (
        Number(
          round.summary.coinsPerHourReportedNormalized ||
            round.derived.coinsPerHourComputed,
        ) || null
      )
    case 'cellsPerHour':
      return Number(round.derived.cellsPerHour) || null
    case 'rerollShardsPerHour':
      return Number(round.derived.rerollShardsPerHour) || null
    case 'coinsFromDeathWavePerHour':
      return Number(round.derived.coinsFromDeathWavePerHour) || null
    case 'coinsFromGoldenTowerPerHour':
      return Number(round.derived.coinsFromGoldenTowerPerHour) || null
    case 'coinsFromBlackHolePerHour':
      return Number(round.derived.coinsFromBlackHolePerHour) || null
    case 'coinsFromSpotlightPerHour':
      return Number(round.derived.coinsFromSpotlightPerHour) || null
    case 'coinsFromCoinUpgradePerHour':
      return Number(round.derived.coinsFromCoinUpgradePerHour) || null
    case 'coinsFromCoinBonusesPerHour':
      return Number(round.derived.coinsFromCoinBonusesPerHour) || null
    case 'summonedEnemiesPerHour':
      return Number(round.derived.summonedEnemiesPerHour) || null
    case 'guardianCoinsStolenPerHour':
      return Number(round.derived.guardianCoinsStolenPerHour) || null
    case 'coinsFetchedPerHour':
      return Number(round.derived.coinsFetchedPerHour) || null
    case 'wavesSkippedPct':
      return Number(round.derived.wavesSkippedPct) || null
    default:
      return null
  }
}

function getPercentileRank(values: number[], value: number): number {
  if (values.length <= 1) return 0.5

  const sorted: number[] = [...values].sort(
    (a: number, b: number): number => a - b,
  )
  const index: number = sorted.findIndex(
    (item: number): boolean => item >= value,
  )

  if (index === -1) return 1
  return index / (sorted.length - 1)
}

function getHeatmapStyle(percentile: number | null): React.CSSProperties {
  if (percentile === null) {
    return {}
  }

  if (percentile >= 0.8) {
    return { backgroundColor: '#dcfce7' }
  }
  if (percentile >= 0.6) {
    return { backgroundColor: '#ecfccb' }
  }
  if (percentile >= 0.4) {
    return { backgroundColor: '#f8fafc' }
  }
  if (percentile >= 0.2) {
    return { backgroundColor: '#fef3c7' }
  }

  return { backgroundColor: '#fee2e2' }
}

function getCellHeatmapStyle(
  round: RoundRecord,
  columnKey: string,
  displayedRounds: RoundRecord[],
): React.CSSProperties {
  if (!HEATMAP_COLUMN_KEYS.has(columnKey)) {
    return {}
  }

  const value: number | null = getHeatmapNumericValue(round, columnKey)
  if (value === null || !Number.isFinite(value)) {
    return {}
  }

  const values: number[] = displayedRounds
    .map((item: RoundRecord): number | null =>
      getHeatmapNumericValue(item, columnKey),
    )
    .filter(
      (item: number | null): item is number =>
        item !== null && Number.isFinite(item),
    )

  if (values.length < 2) {
    return {}
  }

  const percentile: number = getPercentileRank(values, value)
  return getHeatmapStyle(percentile)
}

function detectSourceFormatVersion(lines: string[]): 1 | 2 {
  const normalizedLines: string[] = lines.map((line: string): string =>
    line.trim().toLowerCase(),
  )

  const hasV2Sections: boolean =
    normalizedLines.includes('records') ||
    normalizedLines.includes('damage taken') ||
    normalizedLines.includes('counts') ||
    normalizedLines.includes('currencies') ||
    normalizedLines.includes('enemies destroyed by')

  return hasV2Sections ? 2 : 1
}

async function parseBattleReport(
  rawText: string,
  existingRounds: RoundRecord[],
): Promise<ParseResult> {
  const trimmedText = rawText.trim()
  if (!trimmedText) {
    return {
      record: null,
      previewSummary: ['Nothing to parse. Paste a battle report first.'],
      saveable: false,
    }
  }
  const nowUtc = new Date().toISOString()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const lines = trimmedText
    .split(/\r?\n/)
    .map((line: string): string => line.trimEnd())
    .filter((line: string): boolean => line.trim().length > 0)

  const sourceFormatVersion: 1 | 2 = detectSourceFormatVersion(lines)

  const warnings: ParseMessage[] = []
  const errors: ParseMessage[] = []
  const unparsedLines: string[] = []
  const stats: ParsedStat[] = []
  const summary = defaultSummary()
  let sectionOriginal = 'Battle Report'
  let sectionKey = 'battle_report'
  let battleDateRaw: string | null = null

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    const lower = line.toLowerCase()
    if (SECTION_NAMES.has(lower)) {
      sectionOriginal = line
      sectionKey = normalizeLabelToSnakeCase(line)
      continue
    }
    const parts = line.includes('	')
      ? line.split('	').filter((part: string): boolean => part.trim().length > 0)
      : line
          .split(/\s{2,}/)
          .filter((part: string): boolean => part.trim().length > 0)
    if (parts.length < 2) {
      unparsedLines.push(line)
      warnings.push({
        severity: 'warning',
        message: `Unparsed line preserved: ${line}`,
      })
      continue
    }
    const labelOriginal = parts[0].trim()
    const rawValue = parts.slice(1).join(' ').trim()
    const labelNormalized = normalizeLabelToSnakeCase(labelOriginal)
    const canonicalField = getCanonicalField(sectionKey, labelNormalized)
    const valueType = classifyValue(rawValue, labelOriginal)
    const normalizedValue = parseNormalizedValue(rawValue, valueType)
    if (
      (valueType === 'currency' ||
        valueType === 'suffixNumber' ||
        valueType === 'duration' ||
        valueType === 'multiplier') &&
      normalizedValue === null
    ) {
      warnings.push({
        severity: 'warning',
        message: `Could not normalize value for ${labelOriginal}: ${rawValue}`,
      })
    }
    const assignResult =
      sourceFormatVersion === 2
        ? assignSummaryFieldV2(
            summary,
            canonicalField,
            rawValue,
            normalizedValue,
            valueType,
          )
        : assignSummaryFieldV1(
            summary,
            canonicalField,
            rawValue,
            normalizedValue,
            valueType,
          )
    if (assignResult.battleDateRaw) battleDateRaw = assignResult.battleDateRaw
    stats.push({
      sectionOriginal,
      sectionKey,
      labelOriginal,
      labelNormalized,
      canonicalField,
      rawValue,
      valueType,
      normalizedValue,
      lineIndex: i,
    })
  }

  const parsedDate = parseBattleDate(battleDateRaw || '')
  if (!battleDateRaw)
    warnings.push({
      severity: 'warning',
      message: 'Battle Date was not found.',
    })
  const recognizedRows = stats.length
  const saveable = Boolean(battleDateRaw) && recognizedRows >= 8
  const isPartial = !saveable || warnings.length > 0 || unparsedLines.length > 0
  const derived = computeDerived(summary)
  const rawReportHash = await sha256Hex(trimmedText)
  const probableDuplicateFingerprint = buildFingerprint(summary, battleDateRaw)
  const exactDuplicate = existingRounds.find(
    (round: RoundRecord): boolean => round.rawReportHash === rawReportHash,
  )
  const likelyDuplicate = existingRounds.find(
    (round: RoundRecord): boolean =>
      round.probableDuplicateFingerprint === probableDuplicateFingerprint,
  )
  if (exactDuplicate)
    warnings.push({
      severity: 'warning',
      message: 'Exact duplicate detected. You can still save it.',
    })
  else if (likelyDuplicate)
    warnings.push({
      severity: 'warning',
      message: 'Likely duplicate detected. You can still save it.',
    })
  if (!saveable) {
    errors.push({
      severity: 'error',
      message:
        'Minimum valid threshold not met. A saveable report requires a Battle Date and at least 8 parsed rows.',
    })
  }
  const previewSummary = [
    `Date: ${battleDateRaw || '—'}`,
    `Tier: ${summary.tier ?? '—'}`,
    `Wave: ${summary.wave ?? '—'}`,
    `Coins Earned: ${summary.coinsEarnedRaw || '—'}`,
    `Cells Earned: ${summary.cellsEarnedRaw || '—'}`,
    `Real Time: ${summary.realTimeSeconds !== null ? formatDuration(summary.realTimeSeconds) : '—'}`,
  ]
  return {
    saveable,
    previewSummary,
    record: {
      id: generateId(),
      schemaVersion: RECORD_SCHEMA_VERSION,
      sourceFormatVersion,
      parserVersion: PARSER_VERSION,
      derivedMetricsVersion: DERIVED_METRICS_VERSION,
      createdAtUtc: nowUtc,
      updatedAtUtc: nowUtc,
      importTimezone: timezone,
      rawReportText: trimmedText,
      rawReportHash,
      probableDuplicateFingerprint,
      isPartial,
      warnings,
      errors,
      unparsedLines,
      battleDateRaw,
      battleDateLocal: parsedDate.local,
      battleDateUtc: parsedDate.utc,
      summary,
      derived,
      stats,
    },
  }
}

function parseNumberForSort(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const num = Number(value)
  return Number.isFinite(num) ? num : Number.NEGATIVE_INFINITY
}

const COLUMNS: ColumnDef[] = [
  {
    key: 'date',
    label: 'Date',
    group: 'default',
    getValue: (r) => formatLocalDate(r.battleDateUtc, r.battleDateRaw),
    sortValue: (r) =>
      r.battleDateUtc ? new Date(r.battleDateUtc).getTime() : 0,
  },
  {
    key: 'tier',
    label: 'Tier',
    group: 'default',
    getValue: (r) => (r.summary.tier !== null ? String(r.summary.tier) : '—'),
    sortValue: (r) => r.summary.tier ?? -1,
  },
  {
    key: 'gameTime',
    label: 'Game Time',
    group: 'default',
    getValue: (r) => formatDuration(r.summary.gameTimeSeconds),
    sortValue: (r) => r.summary.gameTimeSeconds ?? -1,
  },
  {
    key: 'realTime',
    label: 'Real Time',
    group: 'default',
    getValue: (r) => formatDuration(r.summary.realTimeSeconds),
    sortValue: (r) => r.summary.realTimeSeconds ?? -1,
  },
  {
    key: 'speed',
    label: 'Speed',
    group: 'default',
    getValue: (r) => formatSpeed(r.derived.speed),
    sortValue: (r) => parseNumberForSort(r.derived.speed),
  },
  {
    key: 'wave',
    label: 'Wave',
    group: 'default',
    getValue: (r) => (r.summary.wave !== null ? String(r.summary.wave) : '—'),
    sortValue: (r) => r.summary.wave ?? -1,
  },
  {
    key: 'wavesPerHour',
    label: 'Waves / hr',
    group: 'default',
    getValue: (r) => abbreviateFromNumericString(r.derived.wavesPerHour),
    sortValue: (r) => parseNumberForSort(r.derived.wavesPerHour),
  },
  {
    key: 'killedBy',
    label: 'Killed By',
    group: 'default',
    getValue: (r) => r.summary.killedBy || '—',
    sortValue: (r) => r.summary.killedBy || '',
  },
  {
    key: 'coinsEarned',
    label: 'Coins Earned',
    group: 'default',
    getValue: (r) => r.summary.coinsEarnedRaw || '—',
    sortValue: (r) => parseNumberForSort(r.summary.coinsEarnedNormalized),
  },
  {
    key: 'coinsPerHour',
    label: 'Coins / hr',
    group: 'default',
    getValue: (r) =>
      r.summary.coinsPerHourReportedRaw ||
      abbreviateFromNumericString(r.derived.coinsPerHourComputed),
    sortValue: (r) =>
      parseNumberForSort(
        r.summary.coinsPerHourReportedNormalized ||
          r.derived.coinsPerHourComputed,
      ),
  },
  {
    key: 'cells',
    label: 'Cells',
    group: 'default',
    getValue: (r) => r.summary.cellsEarnedRaw || '—',
    sortValue: (r) => parseNumberForSort(r.summary.cellsEarnedNormalized),
  },
  {
    key: 'cellsPerHour',
    label: 'Cells / hr',
    group: 'default',
    getValue: (r) => abbreviateFromNumericString(r.derived.cellsPerHour),
    sortValue: (r) => parseNumberForSort(r.derived.cellsPerHour),
  },
  {
    key: 'rerollShards',
    label: 'Reroll Shards',
    group: 'default',
    getValue: (r) => r.summary.rerollShardsEarnedRaw || '—',
    sortValue: (r) =>
      parseNumberForSort(r.summary.rerollShardsEarnedNormalized),
  },
  {
    key: 'rerollShardsPerHour',
    label: 'Reroll Shards / hr',
    group: 'default',
    getValue: (r) => abbreviateFromNumericString(r.derived.rerollShardsPerHour),
    sortValue: (r) => parseNumberForSort(r.derived.rerollShardsPerHour),
  },
  {
    key: 'deathDefy',
    label: 'Death Defy',
    group: 'default',
    getValue: (r) =>
      r.summary.deathDefy !== null ? String(r.summary.deathDefy) : '—',
    sortValue: (r) => r.summary.deathDefy ?? -1,
  },
  {
    key: 'wavesSkipped',
    label: 'Waves Skipped',
    group: 'default',
    getValue: (r) =>
      r.summary.wavesSkipped !== null ? String(r.summary.wavesSkipped) : '—',
    sortValue: (r) => r.summary.wavesSkipped ?? -1,
  },
  {
    key: 'wavesSkippedPct',
    label: 'Waves Skipped %',
    group: 'default',
    getValue: (r) => formatPercent(r.derived.wavesSkippedPct),
    sortValue: (r) => parseNumberForSort(r.derived.wavesSkippedPct),
  },
  {
    key: 'coinsFromDeathWave',
    label: 'DW Coins',
    group: 'optional',
    getValue: (r) => r.summary.coinsFromDeathWaveRaw || '—',
    sortValue: (r) =>
      parseNumberForSort(r.summary.coinsFromDeathWaveNormalized),
  },
  {
    key: 'coinsFromDeathWavePerHour',
    label: 'DW Coins / hr',
    group: 'optional',
    getValue: (r) =>
      abbreviateFromNumericString(r.derived.coinsFromDeathWavePerHour),
    sortValue: (r) => parseNumberForSort(r.derived.coinsFromDeathWavePerHour),
  },
  {
    key: 'coinsFromGoldenTower',
    label: 'GT Coins',
    group: 'optional',
    getValue: (r) => r.summary.coinsFromGoldenTowerRaw || '—',
    sortValue: (r) =>
      parseNumberForSort(r.summary.coinsFromGoldenTowerNormalized),
  },
  {
    key: 'coinsFromGoldenTowerPerHour',
    label: 'GT Coins / hr',
    group: 'optional',
    getValue: (r) =>
      abbreviateFromNumericString(r.derived.coinsFromGoldenTowerPerHour),
    sortValue: (r) => parseNumberForSort(r.derived.coinsFromGoldenTowerPerHour),
  },
  {
    key: 'coinsFromBlackHole',
    label: 'BH Coins',
    group: 'optional',
    getValue: (r) => r.summary.coinsFromBlackHoleRaw || '—',
    sortValue: (r) =>
      parseNumberForSort(r.summary.coinsFromBlackHoleNormalized),
  },
  {
    key: 'coinsFromBlackHolePerHour',
    label: 'BH Coins / hr',
    group: 'optional',
    getValue: (r) =>
      abbreviateFromNumericString(r.derived.coinsFromBlackHolePerHour),
    sortValue: (r) => parseNumberForSort(r.derived.coinsFromBlackHolePerHour),
  },
  {
    key: 'coinsFromSpotlight',
    label: 'SL Coins',
    group: 'optional',
    getValue: (r) => r.summary.coinsFromSpotlightRaw || '—',
    sortValue: (r) =>
      parseNumberForSort(r.summary.coinsFromSpotlightNormalized),
  },
  {
    key: 'coinsFromSpotlightPerHour',
    label: 'SL Coins / hr',
    group: 'optional',
    getValue: (r) =>
      abbreviateFromNumericString(r.derived.coinsFromSpotlightPerHour),
    sortValue: (r) => parseNumberForSort(r.derived.coinsFromSpotlightPerHour),
  },
  {
    key: 'coinsFromCoinUpgrade',
    label: 'Upgrade',
    group: 'optional',
    getValue: (r) => r.summary.coinsFromCoinUpgradeRaw || '—',
    sortValue: (r) =>
      parseNumberForSort(r.summary.coinsFromCoinUpgradeNormalized),
  },
  {
    key: 'coinsFromCoinUpgradePerHour',
    label: 'Upgrade / hr',
    group: 'optional',
    getValue: (r) =>
      abbreviateFromNumericString(r.derived.coinsFromCoinUpgradePerHour),
    sortValue: (r) => parseNumberForSort(r.derived.coinsFromCoinUpgradePerHour),
  },
  {
    key: 'coinsFromCoinBonuses',
    label: 'Bonuses',
    group: 'optional',
    getValue: (r) => r.summary.coinsFromCoinBonusesRaw || '—',
    sortValue: (r) =>
      parseNumberForSort(r.summary.coinsFromCoinBonusesNormalized),
  },
  {
    key: 'coinsFromCoinBonusesPerHour',
    label: 'Bonuses / hr',
    group: 'optional',
    getValue: (r) =>
      abbreviateFromNumericString(r.derived.coinsFromCoinBonusesPerHour),
    sortValue: (r) => parseNumberForSort(r.derived.coinsFromCoinBonusesPerHour),
  },
  {
    key: 'summonedEnemies',
    label: 'Summoned',
    group: 'optional',
    getValue: (r) => r.summary.guardianSummonedEnemiesRaw || '—',
    sortValue: (r) =>
      parseNumberForSort(r.summary.guardianSummonedEnemiesNormalized),
  },
  {
    key: 'summonedEnemiesPerHour',
    label: 'Summoned / hr',
    group: 'optional',
    getValue: (r) =>
      abbreviateFromNumericString(r.derived.summonedEnemiesPerHour),
    sortValue: (r) => parseNumberForSort(r.derived.summonedEnemiesPerHour),
  },
  {
    key: 'guardianCoinsStolen',
    label: 'Stolen',
    group: 'optional',
    getValue: (r) => r.summary.guardianCoinsStolenRaw || '—',
    sortValue: (r) =>
      parseNumberForSort(r.summary.guardianCoinsStolenNormalized),
  },
  {
    key: 'guardianCoinsStolenPerHour',
    label: 'Stolen / hr',
    group: 'optional',
    getValue: (r) =>
      abbreviateFromNumericString(r.derived.guardianCoinsStolenPerHour),
    sortValue: (r) => parseNumberForSort(r.derived.guardianCoinsStolenPerHour),
  },
  {
    key: 'coinsFetched',
    label: 'Fetched',
    group: 'optional',
    getValue: (r) => r.summary.coinsFetchedRaw || '—',
    sortValue: (r) => parseNumberForSort(r.summary.coinsFetchedNormalized),
  },
  {
    key: 'coinsFetchedPerHour',
    label: 'Fetched / hr',
    group: 'optional',
    getValue: (r) => abbreviateFromNumericString(r.derived.coinsFetchedPerHour),
    sortValue: (r) => parseNumberForSort(r.derived.coinsFetchedPerHour),
  },
  {
    key: 'gems',
    label: 'Gems',
    group: 'optional',
    getValue: (r) => r.summary.gemsRaw || '—',
    sortValue: (r) => parseNumberForSort(r.summary.gemsNormalized),
  },
  {
    key: 'medals',
    label: 'Medals',
    group: 'optional',
    getValue: (r) => r.summary.medalsRaw || '—',
    sortValue: (r) => parseNumberForSort(r.summary.medalsNormalized),
  },
  {
    key: 'rerollShardsFetched',
    label: 'Reroll Shards Fetched',
    group: 'optional',
    getValue: (r) => r.summary.rerollShardsFetchedRaw || '—',
    sortValue: (r) =>
      parseNumberForSort(r.summary.rerollShardsFetchedNormalized),
  },
  {
    key: 'cannonShards',
    label: 'Cannon Shards',
    group: 'optional',
    getValue: (r) => r.summary.cannonShardsRaw || '—',
    sortValue: (r) => parseNumberForSort(r.summary.cannonShardsNormalized),
  },
  {
    key: 'armorShards',
    label: 'Armor Shards',
    group: 'optional',
    getValue: (r) => r.summary.armorShardsRaw || '—',
    sortValue: (r) => parseNumberForSort(r.summary.armorShardsNormalized),
  },
  {
    key: 'generatorShards',
    label: 'Generator Shards',
    group: 'optional',
    getValue: (r) => r.summary.generatorShardsRaw || '—',
    sortValue: (r) => parseNumberForSort(r.summary.generatorShardsNormalized),
  },
  {
    key: 'coreShards',
    label: 'Core Shards',
    group: 'optional',
    getValue: (r) => r.summary.coreShardsRaw || '—',
    sortValue: (r) => parseNumberForSort(r.summary.coreShardsNormalized),
  },
  {
    key: 'commonModules',
    label: 'Common Modules',
    group: 'optional',
    getValue: (r) => r.summary.commonModulesRaw || '—',
    sortValue: (r) => parseNumberForSort(r.summary.commonModulesNormalized),
  },
  {
    key: 'rareModules',
    label: 'Rare Modules',
    group: 'optional',
    getValue: (r) => r.summary.rareModulesRaw || '—',
    sortValue: (r) => parseNumberForSort(r.summary.rareModulesNormalized),
  },
  {
    key: 'startTime',
    label: 'Start Time',
    group: 'optional',
    getValue: (r: RoundRecord): string => r.summary.startTimeRaw || '—',
    sortValue: (r: RoundRecord): string => r.summary.startTimeRaw || '',
  },
  {
    key: 'endTime',
    label: 'End Time',
    group: 'optional',
    getValue: (r: RoundRecord): string => r.summary.endTimeRaw || '—',
    sortValue: (r: RoundRecord): string => r.summary.endTimeRaw || '',
  },
  {
    key: 'difference',
    label: 'Difference',
    group: 'optional',
    getValue: (r: RoundRecord): string =>
      r.summary.differenceSeconds !== null
        ? formatDuration(r.summary.differenceSeconds)
        : r.summary.differenceRaw || '—',
    sortValue: (r: RoundRecord): number => r.summary.differenceSeconds ?? -1,
  },
  {
    key: 'upTimePct',
    label: 'Up Time %',
    group: 'optional',
    getValue: (r: RoundRecord): string =>
      r.summary.upTimePctValue !== null
        ? `${r.summary.upTimePctValue.toFixed(2)}%`
        : r.summary.upTimePctRaw || '—',
    sortValue: (r: RoundRecord): number => r.summary.upTimePctValue ?? -1,
  },
  {
    key: 'dayUpPct',
    label: 'Day Up %',
    group: 'optional',
    getValue: (r: RoundRecord): string =>
      r.summary.dayUpPctValue !== null
        ? `${r.summary.dayUpPctValue.toFixed(2)}%`
        : r.summary.dayUpPctRaw || '—',
    sortValue: (r: RoundRecord): number => r.summary.dayUpPctValue ?? -1,
  },
  {
    key: 'dayDown',
    label: 'Day Down',
    group: 'optional',
    getValue: (r: RoundRecord): string =>
      r.summary.dayDownValue !== null
        ? String(r.summary.dayDownValue)
        : r.summary.dayDownRaw || '—',
    sortValue: (r: RoundRecord): number => r.summary.dayDownValue ?? -1,
  },
  {
    key: 'totalUpPct',
    label: 'Total Up %',
    group: 'optional',
    getValue: (r: RoundRecord): string =>
      r.summary.totalUpPctValue !== null
        ? `${r.summary.totalUpPctValue.toFixed(2)}%`
        : r.summary.totalUpPctRaw || '—',
    sortValue: (r: RoundRecord): number => r.summary.totalUpPctValue ?? -1,
  },
  {
    key: 'daysSince',
    label: 'Days Since',
    group: 'optional',
    getValue: (r: RoundRecord): string =>
      r.summary.daysSinceValue !== null
        ? String(r.summary.daysSinceValue)
        : r.summary.daysSinceRaw || '—',
    sortValue: (r: RoundRecord): number => r.summary.daysSinceValue ?? -1,
  },
]

const DEFAULT_COLUMN_KEYS = COLUMNS.filter(
  (column: ColumnDef): boolean => column.group === 'default',
).map((column: ColumnDef): string => column.key)
const EXTENDED_COLUMN_KEYS = COLUMNS.map(
  (column: ColumnDef): string => column.key,
)

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f8fafc',
    padding: 24,
    color: '#0f172a',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  container: {
    width: '100%',
    maxWidth: '100%',
    margin: 0,
    display: 'grid',
    gap: 24,
  },
  card: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 20,
    boxShadow: '0 1px 3px rgba(15,23,42,0.08)',
    overflow: 'hidden',
  },
  cardHeader: { padding: '20px 20px 8px', fontSize: 22, fontWeight: 700 },
  cardBody: { padding: 20, display: 'grid', gap: 16 },
  row: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  button: {
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    padding: '10px 14px',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
  primaryButton: {
    border: '1px solid #0f172a',
    borderRadius: 10,
    padding: '10px 14px',
    background: '#0f172a',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  },
  input: {
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    padding: '10px 12px',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    padding: 12,
    minHeight: 280,
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
  twoCol: {
    display: 'grid',
    gap: 24,
    gridTemplateColumns: 'minmax(0, 2.5fr) minmax(420px, 1fr)',
    alignItems: 'start',
  },
  tableWrap: {
    overflowX: 'auto',
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    width: '100%',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left',
    padding: 12,
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
    position: 'sticky',
    top: 0,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: 12,
    borderBottom: '1px solid #e2e8f0',
    whiteSpace: 'nowrap',
    verticalAlign: 'top',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    padding: '4px 8px',
    fontSize: 12,
    background: '#e2e8f0',
  },
  warning: {
    border: '1px solid #fcd34d',
    background: '#fffbeb',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
  },
  error: {
    border: '1px solid #fca5a5',
    background: '#fef2f2',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
  },
  infoBox: { border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 1000,
  },
  modal: {
    width: 'min(1100px, 100%)',
    maxHeight: '90vh',
    overflow: 'auto',
    background: '#fff',
    borderRadius: 20,
    border: '1px solid #e2e8f0',
    boxShadow: '0 12px 40px rgba(15,23,42,0.25)',
  },
}

export default function App(): React.JSX.Element {
  const [reportText, setReportText] = useState('')
  const [rounds, setRounds] = useState<RoundRecord[]>([])
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [visibleColumnKeys, setVisibleColumnKeys] =
    useState<string[]>(DEFAULT_COLUMN_KEYS)
  const [detailSearch, setDetailSearch] = useState('')

  useEffect((): void => {
    void (async (): Promise<void> => {
      try {
        setRounds(await getAllRounds())
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const selectedRound = useMemo(
    (): RoundRecord | null =>
      rounds.find((r: RoundRecord): boolean => r.id === selectedRoundId) ||
      null,
    [rounds, selectedRoundId],
  )
  const visibleColumns = useMemo(
    (): ColumnDef[] =>
      COLUMNS.filter((c: ColumnDef): boolean =>
        visibleColumnKeys.includes(c.key),
      ),
    [visibleColumnKeys],
  )

  const filteredRounds = useMemo((): RoundRecord[] => {
    const needle = searchTerm.trim().toLowerCase()
    const searched = needle
      ? rounds.filter((round: RoundRecord): boolean =>
          [
            round.battleDateRaw || '',
            String(round.summary.tier ?? ''),
            String(round.summary.wave ?? ''),
            round.summary.killedBy || '',
            round.summary.coinsEarnedRaw || '',
            round.summary.cellsEarnedRaw || '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        )
      : [...rounds]
    const sortColumn = COLUMNS.find(
      (column: ColumnDef): boolean => column.key === sortKey,
    )
    if (!sortColumn) return searched
    searched.sort((a: RoundRecord, b: RoundRecord): number => {
      const aValue = sortColumn.sortValue(a)
      const bValue = sortColumn.sortValue(b)
      const result =
        typeof aValue === 'number' && typeof bValue === 'number'
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue))
      return sortDirection === 'asc' ? result : -result
    })
    return searched
  }, [rounds, searchTerm, sortDirection, sortKey])

  const detailStats = useMemo((): ParsedStat[] => {
    if (!selectedRound) return []
    const needle = detailSearch.trim().toLowerCase()
    if (!needle) return selectedRound.stats
    return selectedRound.stats.filter((stat: ParsedStat): boolean =>
      [
        stat.sectionOriginal,
        stat.labelOriginal,
        stat.rawValue,
        stat.labelNormalized,
        stat.canonicalField || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [selectedRound, detailSearch])

  async function handleParsePreview(): Promise<void> {
    const result = await parseBattleReport(reportText, rounds)
    setParseResult(result)
    setPreviewOpen(true)
  }

  async function handleSaveParsedRecord(): Promise<void> {
    if (!parseResult?.record) return
    await saveRound(parseResult.record)
    const updated = await getAllRounds()
    setRounds(updated)
    setSelectedRoundId(parseResult.record.id)
    setParseResult(null)
    setPreviewOpen(false)
    setReportText('')
  }

  async function handleDeleteRound(id: string): Promise<void> {
    await deleteRound(id)
    const updated = await getAllRounds()
    setRounds(updated)
    if (selectedRoundId === id) setSelectedRoundId(null)
  }

  async function handleExport(): Promise<void> {
    const payload: ImportPayload = {
      exportedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      parserVersion: PARSER_VERSION,
      derivedMetricsVersion: DERIVED_METRICS_VERSION,
      rounds,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tower-battle-report-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const parsed = JSON.parse(text) as ImportPayload
    const incoming = Array.isArray(parsed.rounds) ? parsed.rounds : []
    const existingByHash = new Set(
      rounds.map((round: RoundRecord): string => round.rawReportHash),
    )
    const toSave = incoming.filter(
      (round: RoundRecord): boolean => !existingByHash.has(round.rawReportHash),
    )
    if (toSave.length > 0) {
      await saveManyRounds(toSave)
      setRounds(await getAllRounds())
    }
    event.target.value = ''
  }

  function toggleColumn(key: string, checked: boolean): void {
    setVisibleColumnKeys((current: string[]): string[] =>
      checked
        ? Array.from(new Set([...current, key]))
        : current.filter((item: string): boolean => item !== key),
    )
  }

  const [detailCollapsed, setDetailCollapsed] = useState(true)
  const [isMobileLayout, setIsMobileLayout] = useState<boolean>(
    window.innerWidth < 900,
  )

  useEffect((): (() => void) => {
    const handleResize = (): void => {
      setIsMobileLayout(window.innerWidth < 900)
    }

    window.addEventListener('resize', handleResize)

    return (): void => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const contentGridStyle: React.CSSProperties = isMobileLayout
    ? {
        display: 'grid',
        gap: 24,
        gridTemplateColumns: '1fr',
      }
    : {
        display: 'grid',
        gap: 24,
        gridTemplateColumns: detailCollapsed
          ? '1fr'
          : 'minmax(0, 2.4fr) minmax(420px, 1fr)',
        alignItems: 'start',
      }

  const detailCardStyle: React.CSSProperties = isMobileLayout
    ? styles.card
    : {
        ...styles.card,
        position: 'sticky',
        top: 24,
      }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.cardHeader}>Tower Battle Report Tracker</div>
          <div style={styles.cardBody}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Paste battle report
              </div>
              <textarea
                style={styles.textarea}
                value={reportText}
                onChange={(
                  event: React.ChangeEvent<HTMLTextAreaElement>,
                ): void => setReportText(event.target.value)}
                placeholder='Paste a full battle report here...'
              />
            </div>
            <div style={styles.row}>
              <button style={styles.primaryButton} onClick={handleParsePreview}>
                Parse Preview
              </button>
              <button
                style={styles.button}
                onClick={handleExport}
                disabled={rounds.length === 0}
              >
                <Download
                  size={16}
                  style={{ marginRight: 6, verticalAlign: 'text-bottom' }}
                />
                Export JSON
              </button>
              <label
                style={{
                  ...styles.button,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Upload size={16} /> Import JSON
                <input
                  type='file'
                  accept='application/json'
                  style={{ display: 'none' }}
                  onChange={handleImport}
                />
              </label>
            </div>
          </div>
        </div>

        <div style={contentGridStyle}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>Rounds</div>
            <div style={styles.cardBody}>
              <div style={{ ...styles.row, justifyContent: 'space-between' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ position: 'relative' }}>
                    <Search
                      size={16}
                      style={{
                        position: 'absolute',
                        left: 12,
                        top: 11,
                        color: '#64748b',
                      }}
                    />
                    <input
                      style={{ ...styles.input, paddingLeft: 36 }}
                      value={searchTerm}
                      onChange={(e): void => setSearchTerm(e.target.value)}
                      placeholder='Search rounds'
                    />
                  </div>
                </div>

                <select
                  style={{ ...styles.input, width: 180 }}
                  value={sortKey}
                  onChange={(e): void => setSortKey(e.target.value)}
                >
                  {COLUMNS.map(
                    (column: ColumnDef): React.JSX.Element => (
                      <option key={column.key} value={column.key}>
                        {column.label}
                      </option>
                    ),
                  )}
                </select>

                <select
                  style={{ ...styles.input, width: 120 }}
                  value={sortDirection}
                  onChange={(e): void =>
                    setSortDirection(e.target.value as 'asc' | 'desc')
                  }
                >
                  <option value='desc'>Desc</option>
                  <option value='asc'>Asc</option>
                </select>
              </div>

              <div style={styles.row}>
                <button
                  style={styles.button}
                  onClick={(): void =>
                    setVisibleColumnKeys(DEFAULT_COLUMN_KEYS)
                  }
                >
                  Default Columns
                </button>
                <button
                  style={styles.button}
                  onClick={(): void =>
                    setVisibleColumnKeys(EXTENDED_COLUMN_KEYS)
                  }
                >
                  Extended Columns
                </button>
              </div>

              <div style={styles.infoBox}>
                <div
                  style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}
                >
                  Column picker
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 10,
                  }}
                >
                  {COLUMNS.map((column: ColumnDef): React.JSX.Element => {
                    const checked = visibleColumnKeys.includes(column.key)
                    return (
                      <label
                        key={column.key}
                        style={{
                          display: 'flex',
                          gap: 8,
                          alignItems: 'center',
                          fontSize: 14,
                        }}
                      >
                        <input
                          type='checkbox'
                          checked={checked}
                          onChange={(e): void =>
                            toggleColumn(column.key, e.target.checked)
                          }
                        />
                        <span>{column.label}</span>
                        <span style={{ ...styles.badge, marginLeft: 'auto' }}>
                          {column.group}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {visibleColumns.map(
                        (column: ColumnDef): React.JSX.Element => (
                          <th key={column.key} style={styles.th}>
                            {column.label}
                          </th>
                        ),
                      )}
                      <th style={styles.th}>Flags</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td
                          style={styles.td}
                          colSpan={visibleColumns.length + 2}
                        >
                          Loading…
                        </td>
                      </tr>
                    ) : filteredRounds.length === 0 ? (
                      <tr>
                        <td
                          style={styles.td}
                          colSpan={visibleColumns.length + 2}
                        >
                          No rounds saved yet.
                        </td>
                      </tr>
                    ) : (
                      filteredRounds.map(
                        (round: RoundRecord): React.JSX.Element => (
                          <tr
                            key={round.id}
                            style={{
                              background:
                                selectedRoundId === round.id
                                  ? '#f1f5f9'
                                  : '#fff',
                              cursor: 'pointer',
                            }}
                            onClick={(): void => setSelectedRoundId(round.id)}
                          >
                            {visibleColumns.map(
                              (column: ColumnDef): React.JSX.Element => (
                                <td
                                  key={column.key}
                                  style={{
                                    ...styles.td,
                                    ...getCellHeatmapStyle(
                                      round,
                                      column.key,
                                      filteredRounds,
                                    ),
                                  }}
                                >
                                  {column.getValue(round)}
                                </td>
                              ),
                            )}
                            <td style={styles.td}>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 6,
                                  flexWrap: 'wrap',
                                }}
                              >
                                {round.isPartial ? (
                                  <span style={styles.badge}>Partial</span>
                                ) : null}
                                {round.warnings.length > 0 ? (
                                  <span style={styles.badge}>
                                    <AlertTriangle size={12} />{' '}
                                    {round.warnings.length}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td
                              style={styles.td}
                              onClick={(e): void => e.stopPropagation()}
                            >
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  style={styles.button}
                                  onClick={(): void =>
                                    setSelectedRoundId(round.id)
                                  }
                                >
                                  <Eye size={16} />
                                </button>
                                <button
                                  style={styles.button}
                                  onClick={(): Promise<void> =>
                                    handleDeleteRound(round.id)
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ),
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={detailCardStyle}>
            <div
              style={{
                ...styles.cardHeader,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span>Round Detail</span>
              <button
                style={styles.button}
                onClick={(): void =>
                  setDetailCollapsed((current: boolean): boolean => !current)
                }
              >
                {detailCollapsed ? 'Expand' : 'Collapse'}
              </button>
            </div>

            {!detailCollapsed && (
              <div style={styles.cardBody}>
                {!selectedRound ? (
                  <div style={{ color: '#64748b', fontSize: 14 }}>
                    Select a round to inspect all parsed stats.
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gap: 12,
                        gridTemplateColumns: isMobileLayout
                          ? '1fr'
                          : 'repeat(2, minmax(0, 1fr))',
                      }}
                    >
                      <div style={styles.infoBox}>
                        <div
                          style={{
                            fontSize: 12,
                            textTransform: 'uppercase',
                            color: '#64748b',
                          }}
                        >
                          Date
                        </div>
                        <div style={{ fontWeight: 700 }}>
                          {formatLocalDate(
                            selectedRound.battleDateUtc,
                            selectedRound.battleDateRaw,
                          )}
                        </div>
                      </div>

                      <div style={styles.infoBox}>
                        <div
                          style={{
                            fontSize: 12,
                            textTransform: 'uppercase',
                            color: '#64748b',
                          }}
                        >
                          Wave
                        </div>
                        <div style={{ fontWeight: 700 }}>
                          {selectedRound.summary.wave ?? '—'}
                        </div>
                      </div>

                      <div style={styles.infoBox}>
                        <div
                          style={{
                            fontSize: 12,
                            textTransform: 'uppercase',
                            color: '#64748b',
                          }}
                        >
                          Real Time
                        </div>
                        <div style={{ fontWeight: 700 }}>
                          {formatDuration(
                            selectedRound.summary.realTimeSeconds,
                          )}
                        </div>
                      </div>

                      <div style={styles.infoBox}>
                        <div
                          style={{
                            fontSize: 12,
                            textTransform: 'uppercase',
                            color: '#64748b',
                          }}
                        >
                          Coins
                        </div>
                        <div style={{ fontWeight: 700 }}>
                          {selectedRound.summary.coinsEarnedRaw || '—'}
                        </div>
                      </div>
                    </div>

                    <div style={{ position: 'relative' }}>
                      <Search
                        size={16}
                        style={{
                          position: 'absolute',
                          left: 12,
                          top: 11,
                          color: '#64748b',
                        }}
                      />
                      <input
                        style={{ ...styles.input, paddingLeft: 36 }}
                        value={detailSearch}
                        onChange={(e): void => setDetailSearch(e.target.value)}
                        placeholder='Search detail stats'
                      />
                    </div>

                    <div style={styles.tableWrap}>
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th style={styles.th}>Section</th>
                            <th style={styles.th}>Stat</th>
                            <th style={styles.th}>Value</th>
                            <th style={styles.th}>Type</th>
                            <th style={styles.th}>Canonical</th>
                            <th style={styles.th}>Normalized</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailStats.map(
                            (stat: ParsedStat): React.JSX.Element => (
                              <tr
                                key={`${stat.lineIndex}-${stat.sectionKey}-${stat.labelNormalized}`}
                              >
                                <td style={styles.td}>
                                  {stat.sectionOriginal}
                                </td>
                                <td style={styles.td}>{stat.labelOriginal}</td>
                                <td style={styles.td}>{stat.rawValue}</td>
                                <td style={styles.td}>{stat.valueType}</td>
                                <td style={styles.td}>
                                  {stat.canonicalField || '—'}
                                </td>
                                <td
                                  style={{
                                    ...styles.td,
                                    fontFamily: 'ui-monospace, monospace',
                                    fontSize: 12,
                                  }}
                                >
                                  {stat.normalizedValue || '—'}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          marginBottom: 8,
                        }}
                      >
                        Warnings
                      </div>
                      {selectedRound.warnings.length === 0 ? (
                        <div style={styles.infoBox}>
                          <CheckCircle2
                            size={16}
                            style={{
                              marginRight: 8,
                              verticalAlign: 'text-bottom',
                            }}
                          />
                          No warnings
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {selectedRound.warnings.map(
                            (
                              warning: ParseMessage,
                              index: number,
                            ): React.JSX.Element => (
                              <div
                                key={`${warning.message}-${index}`}
                                style={styles.warning}
                              >
                                {warning.message}
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {previewOpen && (
        <div
          style={styles.modalBackdrop}
          onClick={(): void => setPreviewOpen(false)}
        >
          <div style={styles.modal} onClick={(e): void => e.stopPropagation()}>
            <div style={styles.cardHeader}>Parse Preview</div>
            <div style={styles.cardBody}>
              <div style={styles.infoBox}>
                {parseResult?.previewSummary.map(
                  (line: string): React.JSX.Element => (
                    <div key={line} style={{ fontSize: 14, marginBottom: 6 }}>
                      {line}
                    </div>
                  ),
                )}
              </div>

              {parseResult?.record && (
                <>
                  <div>
                    <div
                      style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}
                    >
                      Warnings
                    </div>
                    {parseResult.record.warnings.length === 0 ? (
                      <div style={styles.infoBox}>No warnings</div>
                    ) : (
                      parseResult.record.warnings.map(
                        (
                          warning: ParseMessage,
                          index: number,
                        ): React.JSX.Element => (
                          <div
                            key={`${warning.message}-${index}`}
                            style={styles.warning}
                          >
                            {warning.message}
                          </div>
                        ),
                      )
                    )}
                  </div>

                  <div>
                    <div
                      style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}
                    >
                      Errors
                    </div>
                    {parseResult.record.errors.length === 0 ? (
                      <div style={styles.infoBox}>No errors</div>
                    ) : (
                      parseResult.record.errors.map(
                        (
                          error: ParseMessage,
                          index: number,
                        ): React.JSX.Element => (
                          <div
                            key={`${error.message}-${index}`}
                            style={styles.error}
                          >
                            {error.message}
                          </div>
                        ),
                      )
                    )}
                  </div>

                  <div>
                    <div
                      style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}
                    >
                      Unparsed Lines
                    </div>
                    {parseResult.record.unparsedLines.length === 0 ? (
                      <div style={styles.infoBox}>None</div>
                    ) : (
                      <div
                        style={{
                          ...styles.infoBox,
                          fontFamily: 'ui-monospace, monospace',
                        }}
                      >
                        {parseResult.record.unparsedLines.map(
                          (line: string): React.JSX.Element => (
                            <div key={line}>{line}</div>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div style={{ ...styles.row, justifyContent: 'flex-end' }}>
                <button
                  style={styles.button}
                  onClick={(): void => setPreviewOpen(false)}
                >
                  Cancel
                </button>
                <button
                  style={styles.primaryButton}
                  onClick={handleSaveParsedRecord}
                  disabled={!parseResult?.saveable || !parseResult?.record}
                >
                  Save Record
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
