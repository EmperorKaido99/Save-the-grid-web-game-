// Real renewable energy facts — shown when placing defenses
export const FUN_FACTS = {
  SOLAR_PANEL: [
    'South Africa gets about 2,500 hours of sunshine per year — one of the highest in the world.',
    'A single solar panel can offset about 1 tonne of CO2 over its lifetime.',
    'Solar panels have no moving parts, so they can last 25-30 years with minimal maintenance.',
    'South Africa\'s largest solar farm (De Aar) generates enough power for 75,000 homes.',
    'The cost of solar energy has dropped over 90% since 2010.',
    'Solar panels work on cloudy days too — they use light, not heat.',
    'Rooftop solar in SA could generate up to 70 GW — more than the entire current grid capacity.',
    'A 5 kW home solar system can save over R30,000 per year on electricity bills.',
  ],
  WIND_TURBINE: [
    'South Africa\'s wind energy potential is among the best globally, especially along the coasts.',
    'A single large wind turbine can power over 1,500 South African homes.',
    'Wind turbines produce zero emissions during operation — only manufacturing has a carbon cost.',
    'The Jeffreys Bay Wind Farm was South Africa\'s first commercial wind farm, operational since 2014.',
    'Modern wind turbines convert up to 50% of wind energy into electricity — coal plants manage about 33%.',
    'Wind energy creates more jobs per unit of electricity than coal or gas.',
    'South Africa\'s Renewable Energy IPP Programme has attracted over R200 billion in investment.',
    'Wind turbines can operate for 20-25 years and the land beneath them can still be farmed.',
  ],
};

export function getRandomFact(defenseType) {
  const facts = FUN_FACTS[defenseType];
  return facts[Math.floor(Math.random() * facts.length)];
}
