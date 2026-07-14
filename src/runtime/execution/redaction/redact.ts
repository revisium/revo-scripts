const redactedValue = '[REDACTED]';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodePointer = (pointer: string): readonly string[] => {
  if (pointer === '') {
    return [];
  }

  return pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
};

const arrayIndex = (segment: string): number | undefined => {
  if (!/^(?:0|[1-9]\d*)$/.test(segment)) {
    return undefined;
  }

  const index = Number(segment);
  return Number.isSafeInteger(index) ? index : undefined;
};

const childAt = (value: unknown, segment: string): unknown => {
  if (Array.isArray(value)) {
    const index = arrayIndex(segment);
    return index === undefined ? undefined : value[index];
  }

  if (isRecord(value) && Object.hasOwn(value, segment)) {
    return value[segment];
  }

  return undefined;
};

const replaceChild = (value: unknown, segment: string): void => {
  if (Array.isArray(value)) {
    const index = arrayIndex(segment);

    if (index !== undefined && index < value.length) {
      value[index] = redactedValue;
    }

    return;
  }

  if (isRecord(value) && Object.hasOwn(value, segment)) {
    value[segment] = redactedValue;
  }
};

const redactAtPointer = (value: unknown, pointer: string): unknown => {
  const segments = decodePointer(pointer);

  if (segments.length === 0) {
    return redactedValue;
  }

  let parent: unknown = value;

  for (const segment of segments.slice(0, -1)) {
    parent = childAt(parent, segment);

    if (parent === undefined) {
      return value;
    }
  }

  const finalSegment = segments.at(-1);

  if (finalSegment !== undefined) {
    replaceChild(parent, finalSegment);
  }

  return value;
};

export const redactValue = (value: unknown, pointers: readonly string[]): unknown => {
  let redacted = structuredClone(value);

  pointers.forEach((pointer) => {
    redacted = redactAtPointer(redacted, pointer);
  });

  return redacted;
};
