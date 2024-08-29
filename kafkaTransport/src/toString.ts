export default function toString(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }

  if (message instanceof Error) {
    return message.stack || message.toString();
  }
  try {
    const result = JSON.stringify(message, null, 4);
    // JSON.stringify returns undefined for some values, like functions. In those cases
    // we can better fallback to .toString
    if (typeof result === "string") {
      return result;
    }
  } catch (e) {
    // JSON.stringify can throw on some values, most notably on circular objects.
    // We don't want to error here, so we suppress the error and delegate to `.toString`
  }
  if (
    message !== null &&
    message !== undefined &&
    typeof (message as any).toString === "function"
  ) {
    return (message as any).toString();
  }
  return "UNSERIALIZABLE VALUE";
}
