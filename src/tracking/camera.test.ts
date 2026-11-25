import { describe, expect, it } from 'vitest';
import { mapCameraError } from './camera';

// M0.1: every getUserMedia failure maps to a kind with a friendly screen.

const dom = (name: string): DOMException => new DOMException('nope', name);

describe('mapCameraError (M0.1)', () => {
  it('maps permission failures to "denied"', () => {
    expect(mapCameraError(dom('NotAllowedError'))).toBe('denied');
    expect(mapCameraError(dom('PermissionDeniedError'))).toBe('denied');
  });

  it('maps missing hardware to "not-found"', () => {
    expect(mapCameraError(dom('NotFoundError'))).toBe('not-found');
    expect(mapCameraError(dom('DevicesNotFoundError'))).toBe('not-found');
  });

  it('maps hardware-in-use failures to "busy"', () => {
    expect(mapCameraError(dom('NotReadableError'))).toBe('busy');
    expect(mapCameraError(dom('TrackStartError'))).toBe('busy');
    expect(mapCameraError(dom('AbortError'))).toBe('busy');
  });

  it('maps security failures to "insecure"', () => {
    expect(mapCameraError(dom('SecurityError'))).toBe('insecure');
  });

  it('maps anything else to "unknown"', () => {
    expect(mapCameraError(dom('SomethingNewError'))).toBe('unknown');
    expect(mapCameraError(new Error('boom'))).toBe('unknown');
    expect(mapCameraError('string')).toBe('unknown');
  });
});
