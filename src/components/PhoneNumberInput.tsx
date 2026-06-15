import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const COUNTRY_CODES = [
  { code: '+91', label: 'India' },
  { code: '+971', label: 'UAE' },
  { code: '+966', label: 'Saudi Arabia' },
  { code: '+974', label: 'Qatar' },
  { code: '+965', label: 'Kuwait' },
  { code: '+968', label: 'Oman' },
  { code: '+973', label: 'Bahrain' },
  { code: '+1', label: 'USA/Canada' },
  { code: '+44', label: 'UK' },
  { code: '+61', label: 'Australia' },
];

interface PhoneNumberInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

const stripNumber = (value: string) => value.replace(/[^0-9]/g, '');

function splitPhoneValue(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith('00') ? `+${trimmed.replace(/^00/, '')}` : trimmed;
  const digits = stripNumber(normalized);
  const matchedCountry = COUNTRY_CODES
    .slice()
    .sort((a, b) => b.code.length - a.code.length)
    .find((country) => digits.startsWith(stripNumber(country.code)));

  const countryCode = matchedCountry?.code ?? '+91';
  const countryDigits = stripNumber(countryCode);
  const nationalNumber = digits.startsWith(countryDigits) ? digits.slice(countryDigits.length) : digits;

  return { countryCode, nationalNumber };
}

export function PhoneNumberInput({ id, value, onChange, required }: PhoneNumberInputProps) {
  const { countryCode, nationalNumber } = splitPhoneValue(value);

  const emitValue = (nextCountryCode: string, nextNationalNumber: string) => {
    const digits = stripNumber(nextNationalNumber);
    onChange(digits ? `${nextCountryCode}${digits}` : nextCountryCode);
  };

  return (
    <div className="flex min-w-0 gap-2">
      <Select value={countryCode} onValueChange={(nextCountryCode) => emitValue(nextCountryCode, nationalNumber)}>
        <SelectTrigger className="w-36 bg-white">
          <SelectValue placeholder="+91" />
        </SelectTrigger>
        <SelectContent>
          {COUNTRY_CODES.map((country) => (
            <SelectItem key={country.code} value={country.code}>
              {country.code} {country.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        required={required}
        inputMode="numeric"
        placeholder="Enter your phone number"
        value={nationalNumber}
        onChange={(event) => emitValue(countryCode, event.target.value)}
        className="min-w-0"
      />
    </div>
  );
}
