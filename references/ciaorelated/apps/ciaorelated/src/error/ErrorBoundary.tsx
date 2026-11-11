// src/error/ErrorBoundary.tsx
import React from "react";
import { useError } from "./ErrorProvider";
import i18n from "../i18n";

export class ErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean }> {
  static contextType = React.createContext({ showError: (_: any) => {} });
  declare context: React.ContextType<typeof ErrorBoundary.contextType>;

  constructor(props:any) {
    super(props);
    this.state = { hasError: false };
  }

  componentDidCatch(error: any) {
    // UI/Render-Fehler abfangen
    // @ts-ignore
    const { showError } = this.props as any;
    showError?.({ title: i18n.t("common.unexpectedError"), message: String(error?.message || error) });
    this.setState({ hasError: true });
  }

  render() {
    return this.props.children as any;
  }
}

// praktischer Wrapper-Hook für Funktionskomponenten:
export const WithBoundary: React.FC<React.PropsWithChildren<{ showError: (e:any)=>void }>> = ({ showError, children }) => {
  // @ts-ignore
  return <ErrorBoundary showError={showError}>{children}</ErrorBoundary>;
};
