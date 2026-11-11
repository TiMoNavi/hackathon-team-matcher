// src/error/ErrorProvider.tsx
import React, { createContext, useContext, useState, useCallback } from "react";
import { Modal, View, Text, TouchableOpacity } from "react-native";

type Err = { title?: string; message: string } | null;
type Ctx = { showError: (e: Err | string) => void; hideError: () => void };

const ErrorCtx = createContext<Ctx>({ showError: () => {}, hideError: () => {} });

export const useError = () => useContext(ErrorCtx);

export const ErrorProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [err, setErr] = useState<Err>(null);

  const showError = useCallback((e: Err | string) => {
    if (!e) return;
    if (typeof e === "string") setErr({ message: e });
    else setErr(e);
  }, []);
  const hideError = useCallback(() => setErr(null), []);

  return (
    <ErrorCtx.Provider value={{ showError, hideError }}>
      {children}
      {/* Minimal Modal/Alert */}
      <Modal transparent visible={!!err} animationType="fade" onRequestClose={hideError}>
        <View style={{ flex:1, backgroundColor:"rgba(0,0,0,0.4)", alignItems:"center", justifyContent:"center", padding:24 }}>
          <View style={{ backgroundColor:"#fff", borderRadius:16, padding:16, maxWidth:420, width:"100%" }}>
            {!!err?.title && <Text style={{ fontSize:18, fontWeight:"700", marginBottom:8 }}>{err.title}</Text>}
            <Text style={{ fontSize:16 }}>{err?.message}</Text>
            <TouchableOpacity onPress={hideError} style={{ alignSelf:"flex-end", marginTop:16, paddingHorizontal:12, paddingVertical:8 }}>
              <Text style={{ color:"#007AFF", fontWeight:"600" }}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ErrorCtx.Provider>
  );
};
