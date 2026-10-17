const { registrationMode, isRegistrationOpen } = require('../src/config/registration');

describe('registration mode', () => {
  test('is open by default', () => {
    expect(registrationMode({})).toBe('open');
    expect(isRegistrationOpen({})).toBe(true);
  });

  test('invite_only closes registration, in any case and with spaces', () => {
    expect(isRegistrationOpen({ REGISTRATION_MODE: 'invite_only' })).toBe(false);
    expect(isRegistrationOpen({ REGISTRATION_MODE: ' Invite_Only ' })).toBe(false);
    expect(isRegistrationOpen({ REGISTRATION_MODE: 'OPEN' })).toBe(true);
  });

  test('an unrecognized value closes registration instead of leaving it open', () => {
    expect(registrationMode({ REGISTRATION_MODE: 'invite-only' })).toBe('invite_only');
    expect(registrationMode({ REGISTRATION_MODE: 'closed' })).toBe('invite_only');
  });
});
