"use client";

import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export default function ProdCheck() {
  const [nome, setNome] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTestRow() {
      const { data, error } = await supabase
        .from("test_produzione")
        .select("nome")
        .eq("id", 1)
        .single();

      if (error) {
        console.error("Errore nella lettura da test_produzione:", error);
        setErrorMessage("ERRORE CONNESSIONE PRODUZIONE");
        return;
      }

      setNome(data?.nome ?? null);
    }

    fetchTestRow();
  }, []);

  return (
    <>
      {errorMessage && <p>{errorMessage}</p>}
      {!errorMessage && nome && <p>Valore letto dal database di produzione: {nome}</p>}
      {!errorMessage && !nome && <p>Verifica connessione al database di produzione...</p>}
    </>
  );
}
