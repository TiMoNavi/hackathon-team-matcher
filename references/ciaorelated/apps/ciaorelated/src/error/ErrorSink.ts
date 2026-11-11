// Kleiner Singleton-Store für die UI-Fehlerfunktion
type Err = { title?: string; message: string };
type ShowError = (e: Err | string) => void;

let _showError: ShowError | null = null;

export function setErrorHandler(fn: ShowError) {
  _showError = fn;
}

export function getErrorHandler(): ShowError {
  return _showError ?? ((_e) => { /* no-op vor Initialisierung */ });
}
