// ─── Full country list (195 countries) ───────────────────────────────────────
// Each entry: { code: ISO-3166-1 alpha-2, name: English name, flag: emoji }
// Flag emoji is derived from regional indicator symbols for ISO-3166-1 alpha-2.

export interface Country {
  code:      string;   // ISO 3166-1 alpha-2
  name:      string;
  flag:      string;   // emoji flag
  continent: string;
}

/** Convert ISO-3166 alpha-2 code to regional-indicator emoji flag */
export function codeToFlag(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
    .join('');
}

export const COUNTRIES: Country[] = [
  // ── Africa ──────────────────────────────────────────────────────────────────
  { code: 'DZ', name: 'Algeria',                  flag: '🇩🇿', continent: 'Africa' },
  { code: 'AO', name: 'Angola',                   flag: '🇦🇴', continent: 'Africa' },
  { code: 'BJ', name: 'Benin',                    flag: '🇧🇯', continent: 'Africa' },
  { code: 'BW', name: 'Botswana',                 flag: '🇧🇼', continent: 'Africa' },
  { code: 'BF', name: 'Burkina Faso',             flag: '🇧🇫', continent: 'Africa' },
  { code: 'BI', name: 'Burundi',                  flag: '🇧🇮', continent: 'Africa' },
  { code: 'CV', name: 'Cabo Verde',               flag: '🇨🇻', continent: 'Africa' },
  { code: 'CM', name: 'Cameroon',                 flag: '🇨🇲', continent: 'Africa' },
  { code: 'CF', name: 'Central African Republic', flag: '🇨🇫', continent: 'Africa' },
  { code: 'TD', name: 'Chad',                     flag: '🇹🇩', continent: 'Africa' },
  { code: 'KM', name: 'Comoros',                  flag: '🇰🇲', continent: 'Africa' },
  { code: 'CD', name: 'DR Congo',                 flag: '🇨🇩', continent: 'Africa' },
  { code: 'CG', name: 'Republic of Congo',        flag: '🇨🇬', continent: 'Africa' },
  { code: 'CI', name: "Côte d'Ivoire",            flag: '🇨🇮', continent: 'Africa' },
  { code: 'DJ', name: 'Djibouti',                 flag: '🇩🇯', continent: 'Africa' },
  { code: 'EG', name: 'Egypt',                    flag: '🇪🇬', continent: 'Africa' },
  { code: 'GQ', name: 'Equatorial Guinea',        flag: '🇬🇶', continent: 'Africa' },
  { code: 'ER', name: 'Eritrea',                  flag: '🇪🇷', continent: 'Africa' },
  { code: 'SZ', name: 'Eswatini',                 flag: '🇸🇿', continent: 'Africa' },
  { code: 'ET', name: 'Ethiopia',                 flag: '🇪🇹', continent: 'Africa' },
  { code: 'GA', name: 'Gabon',                    flag: '🇬🇦', continent: 'Africa' },
  { code: 'GM', name: 'Gambia',                   flag: '🇬🇲', continent: 'Africa' },
  { code: 'GH', name: 'Ghana',                    flag: '🇬🇭', continent: 'Africa' },
  { code: 'GN', name: 'Guinea',                   flag: '🇬🇳', continent: 'Africa' },
  { code: 'GW', name: 'Guinea-Bissau',            flag: '🇬🇼', continent: 'Africa' },
  { code: 'KE', name: 'Kenya',                    flag: '🇰🇪', continent: 'Africa' },
  { code: 'LS', name: 'Lesotho',                  flag: '🇱🇸', continent: 'Africa' },
  { code: 'LR', name: 'Liberia',                  flag: '🇱🇷', continent: 'Africa' },
  { code: 'LY', name: 'Libya',                    flag: '🇱🇾', continent: 'Africa' },
  { code: 'MG', name: 'Madagascar',               flag: '🇲🇬', continent: 'Africa' },
  { code: 'MW', name: 'Malawi',                   flag: '🇲🇼', continent: 'Africa' },
  { code: 'ML', name: 'Mali',                     flag: '🇲🇱', continent: 'Africa' },
  { code: 'MR', name: 'Mauritania',               flag: '🇲🇷', continent: 'Africa' },
  { code: 'MU', name: 'Mauritius',                flag: '🇲🇺', continent: 'Africa' },
  { code: 'MA', name: 'Morocco',                  flag: '🇲🇦', continent: 'Africa' },
  { code: 'MZ', name: 'Mozambique',               flag: '🇲🇿', continent: 'Africa' },
  { code: 'NA', name: 'Namibia',                  flag: '🇳🇦', continent: 'Africa' },
  { code: 'NE', name: 'Niger',                    flag: '🇳🇪', continent: 'Africa' },
  { code: 'NG', name: 'Nigeria',                  flag: '🇳🇬', continent: 'Africa' },
  { code: 'RW', name: 'Rwanda',                   flag: '🇷🇼', continent: 'Africa' },
  { code: 'ST', name: 'São Tomé and Príncipe',    flag: '🇸🇹', continent: 'Africa' },
  { code: 'SN', name: 'Senegal',                  flag: '🇸🇳', continent: 'Africa' },
  { code: 'SC', name: 'Seychelles',               flag: '🇸🇨', continent: 'Africa' },
  { code: 'SL', name: 'Sierra Leone',             flag: '🇸🇱', continent: 'Africa' },
  { code: 'SO', name: 'Somalia',                  flag: '🇸🇴', continent: 'Africa' },
  { code: 'ZA', name: 'South Africa',             flag: '🇿🇦', continent: 'Africa' },
  { code: 'SS', name: 'South Sudan',              flag: '🇸🇸', continent: 'Africa' },
  { code: 'SD', name: 'Sudan',                    flag: '🇸🇩', continent: 'Africa' },
  { code: 'TZ', name: 'Tanzania',                 flag: '🇹🇿', continent: 'Africa' },
  { code: 'TG', name: 'Togo',                     flag: '🇹🇬', continent: 'Africa' },
  { code: 'TN', name: 'Tunisia',                  flag: '🇹🇳', continent: 'Africa' },
  { code: 'UG', name: 'Uganda',                   flag: '🇺🇬', continent: 'Africa' },
  { code: 'ZM', name: 'Zambia',                   flag: '🇿🇲', continent: 'Africa' },
  { code: 'ZW', name: 'Zimbabwe',                 flag: '🇿🇼', continent: 'Africa' },

  // ── Americas ─────────────────────────────────────────────────────────────────
  { code: 'AG', name: 'Antigua and Barbuda',      flag: '🇦🇬', continent: 'Americas' },
  { code: 'AR', name: 'Argentina',                flag: '🇦🇷', continent: 'Americas' },
  { code: 'BS', name: 'Bahamas',                  flag: '🇧🇸', continent: 'Americas' },
  { code: 'BB', name: 'Barbados',                 flag: '🇧🇧', continent: 'Americas' },
  { code: 'BZ', name: 'Belize',                   flag: '🇧🇿', continent: 'Americas' },
  { code: 'BO', name: 'Bolivia',                  flag: '🇧🇴', continent: 'Americas' },
  { code: 'BR', name: 'Brazil',                   flag: '🇧🇷', continent: 'Americas' },
  { code: 'CA', name: 'Canada',                   flag: '🇨🇦', continent: 'Americas' },
  { code: 'CL', name: 'Chile',                    flag: '🇨🇱', continent: 'Americas' },
  { code: 'CO', name: 'Colombia',                 flag: '🇨🇴', continent: 'Americas' },
  { code: 'CR', name: 'Costa Rica',               flag: '🇨🇷', continent: 'Americas' },
  { code: 'CU', name: 'Cuba',                     flag: '🇨🇺', continent: 'Americas' },
  { code: 'DM', name: 'Dominica',                 flag: '🇩🇲', continent: 'Americas' },
  { code: 'DO', name: 'Dominican Republic',       flag: '🇩🇴', continent: 'Americas' },
  { code: 'EC', name: 'Ecuador',                  flag: '🇪🇨', continent: 'Americas' },
  { code: 'SV', name: 'El Salvador',              flag: '🇸🇻', continent: 'Americas' },
  { code: 'GD', name: 'Grenada',                  flag: '🇬🇩', continent: 'Americas' },
  { code: 'GT', name: 'Guatemala',                flag: '🇬🇹', continent: 'Americas' },
  { code: 'GY', name: 'Guyana',                   flag: '🇬🇾', continent: 'Americas' },
  { code: 'HT', name: 'Haiti',                    flag: '🇭🇹', continent: 'Americas' },
  { code: 'HN', name: 'Honduras',                 flag: '🇭🇳', continent: 'Americas' },
  { code: 'JM', name: 'Jamaica',                  flag: '🇯🇲', continent: 'Americas' },
  { code: 'MX', name: 'Mexico',                   flag: '🇲🇽', continent: 'Americas' },
  { code: 'NI', name: 'Nicaragua',                flag: '🇳🇮', continent: 'Americas' },
  { code: 'PA', name: 'Panama',                   flag: '🇵🇦', continent: 'Americas' },
  { code: 'PY', name: 'Paraguay',                 flag: '🇵🇾', continent: 'Americas' },
  { code: 'PE', name: 'Peru',                     flag: '🇵🇪', continent: 'Americas' },
  { code: 'KN', name: 'Saint Kitts and Nevis',    flag: '🇰🇳', continent: 'Americas' },
  { code: 'LC', name: 'Saint Lucia',              flag: '🇱🇨', continent: 'Americas' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', flag: '🇻🇨', continent: 'Americas' },
  { code: 'SR', name: 'Suriname',                 flag: '🇸🇷', continent: 'Americas' },
  { code: 'TT', name: 'Trinidad and Tobago',      flag: '🇹🇹', continent: 'Americas' },
  { code: 'US', name: 'United States',            flag: '🇺🇸', continent: 'Americas' },
  { code: 'UY', name: 'Uruguay',                  flag: '🇺🇾', continent: 'Americas' },
  { code: 'VE', name: 'Venezuela',                flag: '🇻🇪', continent: 'Americas' },

  // ── Asia ─────────────────────────────────────────────────────────────────────
  { code: 'AF', name: 'Afghanistan',              flag: '🇦🇫', continent: 'Asia' },
  { code: 'AM', name: 'Armenia',                  flag: '🇦🇲', continent: 'Asia' },
  { code: 'AZ', name: 'Azerbaijan',               flag: '🇦🇿', continent: 'Asia' },
  { code: 'BH', name: 'Bahrain',                  flag: '🇧🇭', continent: 'Asia' },
  { code: 'BD', name: 'Bangladesh',               flag: '🇧🇩', continent: 'Asia' },
  { code: 'BT', name: 'Bhutan',                   flag: '🇧🇹', continent: 'Asia' },
  { code: 'BN', name: 'Brunei',                   flag: '🇧🇳', continent: 'Asia' },
  { code: 'KH', name: 'Cambodia',                 flag: '🇰🇭', continent: 'Asia' },
  { code: 'CN', name: 'China',                    flag: '🇨🇳', continent: 'Asia' },
  { code: 'CY', name: 'Cyprus',                   flag: '🇨🇾', continent: 'Asia' },
  { code: 'GE', name: 'Georgia',                  flag: '🇬🇪', continent: 'Asia' },
  { code: 'IN', name: 'India',                    flag: '🇮🇳', continent: 'Asia' },
  { code: 'ID', name: 'Indonesia',                flag: '🇮🇩', continent: 'Asia' },
  { code: 'IR', name: 'Iran',                     flag: '🇮🇷', continent: 'Asia' },
  { code: 'IQ', name: 'Iraq',                     flag: '🇮🇶', continent: 'Asia' },
  { code: 'IL', name: 'Israel',                   flag: '🇮🇱', continent: 'Asia' },
  { code: 'JP', name: 'Japan',                    flag: '🇯🇵', continent: 'Asia' },
  { code: 'JO', name: 'Jordan',                   flag: '🇯🇴', continent: 'Asia' },
  { code: 'KZ', name: 'Kazakhstan',               flag: '🇰🇿', continent: 'Asia' },
  { code: 'KW', name: 'Kuwait',                   flag: '🇰🇼', continent: 'Asia' },
  { code: 'KG', name: 'Kyrgyzstan',               flag: '🇰🇬', continent: 'Asia' },
  { code: 'LA', name: 'Laos',                     flag: '🇱🇦', continent: 'Asia' },
  { code: 'LB', name: 'Lebanon',                  flag: '🇱🇧', continent: 'Asia' },
  { code: 'MY', name: 'Malaysia',                 flag: '🇲🇾', continent: 'Asia' },
  { code: 'MV', name: 'Maldives',                 flag: '🇲🇻', continent: 'Asia' },
  { code: 'MN', name: 'Mongolia',                 flag: '🇲🇳', continent: 'Asia' },
  { code: 'MM', name: 'Myanmar',                  flag: '🇲🇲', continent: 'Asia' },
  { code: 'NP', name: 'Nepal',                    flag: '🇳🇵', continent: 'Asia' },
  { code: 'KP', name: 'North Korea',              flag: '🇰🇵', continent: 'Asia' },
  { code: 'OM', name: 'Oman',                     flag: '🇴🇲', continent: 'Asia' },
  { code: 'PK', name: 'Pakistan',                 flag: '🇵🇰', continent: 'Asia' },
  { code: 'PS', name: 'Palestine',                flag: '🇵🇸', continent: 'Asia' },
  { code: 'PH', name: 'Philippines',              flag: '🇵🇭', continent: 'Asia' },
  { code: 'QA', name: 'Qatar',                    flag: '🇶🇦', continent: 'Asia' },
  { code: 'SA', name: 'Saudi Arabia',             flag: '🇸🇦', continent: 'Asia' },
  { code: 'SG', name: 'Singapore',                flag: '🇸🇬', continent: 'Asia' },
  { code: 'KR', name: 'South Korea',              flag: '🇰🇷', continent: 'Asia' },
  { code: 'LK', name: 'Sri Lanka',                flag: '🇱🇰', continent: 'Asia' },
  { code: 'SY', name: 'Syria',                    flag: '🇸🇾', continent: 'Asia' },
  { code: 'TW', name: 'Taiwan',                   flag: '🇹🇼', continent: 'Asia' },
  { code: 'TJ', name: 'Tajikistan',               flag: '🇹🇯', continent: 'Asia' },
  { code: 'TH', name: 'Thailand',                 flag: '🇹🇭', continent: 'Asia' },
  { code: 'TL', name: 'Timor-Leste',              flag: '🇹🇱', continent: 'Asia' },
  { code: 'TR', name: 'Turkey',                   flag: '🇹🇷', continent: 'Asia' },
  { code: 'TM', name: 'Turkmenistan',             flag: '🇹🇲', continent: 'Asia' },
  { code: 'AE', name: 'UAE',                      flag: '🇦🇪', continent: 'Asia' },
  { code: 'UZ', name: 'Uzbekistan',               flag: '🇺🇿', continent: 'Asia' },
  { code: 'VN', name: 'Vietnam',                  flag: '🇻🇳', continent: 'Asia' },
  { code: 'YE', name: 'Yemen',                    flag: '🇾🇪', continent: 'Asia' },

  // ── Europe ───────────────────────────────────────────────────────────────────
  { code: 'AL', name: 'Albania',                  flag: '🇦🇱', continent: 'Europe' },
  { code: 'AD', name: 'Andorra',                  flag: '🇦🇩', continent: 'Europe' },
  { code: 'AT', name: 'Austria',                  flag: '🇦🇹', continent: 'Europe' },
  { code: 'BY', name: 'Belarus',                  flag: '🇧🇾', continent: 'Europe' },
  { code: 'BE', name: 'Belgium',                  flag: '🇧🇪', continent: 'Europe' },
  { code: 'BA', name: 'Bosnia and Herzegovina',   flag: '🇧🇦', continent: 'Europe' },
  { code: 'BG', name: 'Bulgaria',                 flag: '🇧🇬', continent: 'Europe' },
  { code: 'HR', name: 'Croatia',                  flag: '🇭🇷', continent: 'Europe' },
  { code: 'CZ', name: 'Czech Republic',           flag: '🇨🇿', continent: 'Europe' },
  { code: 'DK', name: 'Denmark',                  flag: '🇩🇰', continent: 'Europe' },
  { code: 'EE', name: 'Estonia',                  flag: '🇪🇪', continent: 'Europe' },
  { code: 'FI', name: 'Finland',                  flag: '🇫🇮', continent: 'Europe' },
  { code: 'FR', name: 'France',                   flag: '🇫🇷', continent: 'Europe' },
  { code: 'DE', name: 'Germany',                  flag: '🇩🇪', continent: 'Europe' },
  { code: 'GR', name: 'Greece',                   flag: '🇬🇷', continent: 'Europe' },
  { code: 'HU', name: 'Hungary',                  flag: '🇭🇺', continent: 'Europe' },
  { code: 'IS', name: 'Iceland',                  flag: '🇮🇸', continent: 'Europe' },
  { code: 'IE', name: 'Ireland',                  flag: '🇮🇪', continent: 'Europe' },
  { code: 'IT', name: 'Italy',                    flag: '🇮🇹', continent: 'Europe' },
  { code: 'XK', name: 'Kosovo',                   flag: '🇽🇰', continent: 'Europe' },
  { code: 'LV', name: 'Latvia',                   flag: '🇱🇻', continent: 'Europe' },
  { code: 'LI', name: 'Liechtenstein',            flag: '🇱🇮', continent: 'Europe' },
  { code: 'LT', name: 'Lithuania',                flag: '🇱🇹', continent: 'Europe' },
  { code: 'LU', name: 'Luxembourg',               flag: '🇱🇺', continent: 'Europe' },
  { code: 'MT', name: 'Malta',                    flag: '🇲🇹', continent: 'Europe' },
  { code: 'MD', name: 'Moldova',                  flag: '🇲🇩', continent: 'Europe' },
  { code: 'MC', name: 'Monaco',                   flag: '🇲🇨', continent: 'Europe' },
  { code: 'ME', name: 'Montenegro',               flag: '🇲🇪', continent: 'Europe' },
  { code: 'NL', name: 'Netherlands',              flag: '🇳🇱', continent: 'Europe' },
  { code: 'MK', name: 'North Macedonia',          flag: '🇲🇰', continent: 'Europe' },
  { code: 'NO', name: 'Norway',                   flag: '🇳🇴', continent: 'Europe' },
  { code: 'PL', name: 'Poland',                   flag: '🇵🇱', continent: 'Europe' },
  { code: 'PT', name: 'Portugal',                 flag: '🇵🇹', continent: 'Europe' },
  { code: 'RO', name: 'Romania',                  flag: '🇷🇴', continent: 'Europe' },
  { code: 'RU', name: 'Russia',                   flag: '🇷🇺', continent: 'Europe' },
  { code: 'SM', name: 'San Marino',               flag: '🇸🇲', continent: 'Europe' },
  { code: 'RS', name: 'Serbia',                   flag: '🇷🇸', continent: 'Europe' },
  { code: 'SK', name: 'Slovakia',                 flag: '🇸🇰', continent: 'Europe' },
  { code: 'SI', name: 'Slovenia',                 flag: '🇸🇮', continent: 'Europe' },
  { code: 'ES', name: 'Spain',                    flag: '🇪🇸', continent: 'Europe' },
  { code: 'SE', name: 'Sweden',                   flag: '🇸🇪', continent: 'Europe' },
  { code: 'CH', name: 'Switzerland',              flag: '🇨🇭', continent: 'Europe' },
  { code: 'UA', name: 'Ukraine',                  flag: '🇺🇦', continent: 'Europe' },
  { code: 'GB', name: 'United Kingdom',           flag: '🇬🇧', continent: 'Europe' },
  { code: 'VA', name: 'Vatican City',             flag: '🇻🇦', continent: 'Europe' },

  // ── Oceania ──────────────────────────────────────────────────────────────────
  { code: 'AU', name: 'Australia',                flag: '🇦🇺', continent: 'Oceania' },
  { code: 'FJ', name: 'Fiji',                     flag: '🇫🇯', continent: 'Oceania' },
  { code: 'KI', name: 'Kiribati',                 flag: '🇰🇮', continent: 'Oceania' },
  { code: 'MH', name: 'Marshall Islands',         flag: '🇲🇭', continent: 'Oceania' },
  { code: 'FM', name: 'Micronesia',               flag: '🇫🇲', continent: 'Oceania' },
  { code: 'NR', name: 'Nauru',                    flag: '🇳🇷', continent: 'Oceania' },
  { code: 'NZ', name: 'New Zealand',              flag: '🇳🇿', continent: 'Oceania' },
  { code: 'PW', name: 'Palau',                    flag: '🇵🇼', continent: 'Oceania' },
  { code: 'PG', name: 'Papua New Guinea',         flag: '🇵🇬', continent: 'Oceania' },
  { code: 'WS', name: 'Samoa',                    flag: '🇼🇸', continent: 'Oceania' },
  { code: 'SB', name: 'Solomon Islands',          flag: '🇸🇧', continent: 'Oceania' },
  { code: 'TO', name: 'Tonga',                    flag: '🇹🇴', continent: 'Oceania' },
  { code: 'TV', name: 'Tuvalu',                   flag: '🇹🇻', continent: 'Oceania' },
  { code: 'VU', name: 'Vanuatu',                  flag: '🇻🇺', continent: 'Oceania' },
];

/** Sort by name within continent, with popular countries at top */
const POPULAR_CODES = new Set([
  'US','GB','DE','FR','JP','CN','IN','BR','CA','AU',
  'KR','SG','AE','SA','TR','MX','ID','PK','IR','NG',
  'EG','ZA','RU','IT','ES','NL','CH','SE','NO','PL',
  'TH','MY','PH','BD','VN','UA','AR','CO','PK',
]);

/** Find a Country by name string (handles legacy "🇺🇸 United States" format) */
export function findCountryByName(raw: string): Country | undefined {
  const clean = raw.replace(/^\p{Emoji_Presentation}+\s*/u, '').trim();
  return COUNTRIES.find(c =>
    c.name.toLowerCase() === clean.toLowerCase() ||
    raw.includes(c.flag),
  );
}

/** Get display string from Country object */
export function countryDisplay(c: Country): string {
  return `${c.flag} ${c.name}`;
}

/** Continent order */
const CONTINENT_ORDER = ['Americas', 'Europe', 'Asia', 'Africa', 'Oceania'];

/** Countries sorted: popular first, then alphabetically by continent+name */
export const COUNTRIES_SORTED: Country[] = [
  ...COUNTRIES.filter(c => POPULAR_CODES.has(c.code))
    .sort((a, b) => a.name.localeCompare(b.name)),
  ...COUNTRIES.filter(c => !POPULAR_CODES.has(c.code))
    .sort((a, b) => {
      const ci = CONTINENT_ORDER.indexOf(a.continent) - CONTINENT_ORDER.indexOf(b.continent);
      return ci !== 0 ? ci : a.name.localeCompare(b.name);
    }),
];
