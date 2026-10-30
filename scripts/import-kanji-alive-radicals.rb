require "csv"
require "json"

rows = CSV.parse($stdin.read, headers: true)
base_forms = { "" => "牙", "" => "瓜", "" => "韋" }
normalize = ->(character) { base_forms.fetch(character, character).unicode_normalize(:nfkc) }
variants = rows.group_by { |row| normalize.call(row["Variant-of"].to_s) }
radicals = rows.select { |row| row["Origin"] == "Kangxi" }.map do |row|
  character = normalize.call(row["Radical"])
  names = (variants[character] || []).map { |variant| variant["Reading"] }.compact.uniq
  {
    character: character, strokes: row["Stroke#"].to_i,
    meaning: row["Meaning"], name: row["Reading"], variants: names
  }
end
abort "Expected 214 traditional radicals, got #{radicals.length}" unless radicals.length == 214
puts JSON.pretty_generate(radicals)