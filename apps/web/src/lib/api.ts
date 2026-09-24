import { supabase } from "./supabase.js";

export type Dog = {
  id: string;
  name: string;
  breed?: string | null;
  notes?: string | null;
  embedding?: number[] | null;
};

export type CreateDogInput = {
  name: string;
  breed?: string;
  notes?: string;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

type RequestOptions = {
  method?: string;
  body?: string;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers({ "Content-Type": "application/json" });

  if (data.session?.access_token !== undefined) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message.length > 0 ? message : `Request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

export function fetchDogs(): Promise<Dog[]> {
  return request<Dog[]>("/dogs");
}

export function createDog(input: CreateDogInput): Promise<Dog> {
  return request<Dog>("/dogs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function enrollEmbedding(dogId: string, embedding: number[]): Promise<Dog> {
  return request<Dog>(`/dogs/${encodeURIComponent(dogId)}/embedding`, {
    method: "POST",
    body: JSON.stringify({ embedding }),
  });
}
