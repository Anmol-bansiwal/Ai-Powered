import { isAllowedCorsOrigin, isLocalDevOrigin } from './cors';

describe('cors policy', () => {
  it('always treats localhost and 127.0.0.1 as local', () => {
    expect(isLocalDevOrigin('http://localhost:3000')).toBe(true);
    expect(isLocalDevOrigin('http://localhost:5173')).toBe(true);
    expect(isLocalDevOrigin('http://127.0.0.1:4000')).toBe(true);
    expect(isLocalDevOrigin('https://app.example.com')).toBe(false);
  });

  it('allows local origins without listing them in CORS_ORIGINS', () => {
    expect(isAllowedCorsOrigin('http://localhost:3000', [])).toBe(true);
    expect(isAllowedCorsOrigin('http://127.0.0.1:5173', [])).toBe(true);
    expect(isAllowedCorsOrigin(undefined, [])).toBe(true);
  });

  it('allows only listed remote origins', () => {
    const allowed = ['https://app.example.com'];

    expect(isAllowedCorsOrigin('https://app.example.com', allowed)).toBe(true);
    expect(isAllowedCorsOrigin('https://evil.example', allowed)).toBe(false);
  });
});
