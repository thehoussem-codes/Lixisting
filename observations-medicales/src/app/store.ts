/**
 * Magasin de l'observation en cours d'édition : mises à jour immuables (immer),
 * sauvegarde automatique différée, gestion des conflits et des sessions expirées.
 */
import { produce, type Draft } from 'immer';
import { useSyncExternalStore } from 'react';
import type { Observation, ObservationFull } from '../../shared/types.ts';
import { api, ApiError } from './api.ts';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'offline';

export interface ObsState {
  full: ObservationFull;
  data: Observation;
  rev: number;
  save: SaveState;
  lastSaved: Date | null;
  error: string | null;
  readOnly: boolean;
}

export class ObsStore {
  state: ObsState;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving = false;
  private pending = false;

  constructor(full: ObservationFull, readOnly: boolean) {
    this.state = { full, data: full.data, rev: full.rev, save: 'saved', lastSaved: new Date(full.updatedAt), error: null, readOnly };
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.state;

  private emit(patch: Partial<ObsState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  update = (fn: (d: Draft<Observation>) => void) => {
    if (this.state.readOnly) return;
    const data = produce(this.state.data, fn);
    if (data === this.state.data) return;
    this.emit({ data, save: this.state.save === 'conflict' ? 'conflict' : 'dirty' });
    this.schedule();
  };

  private schedule(delay = 1200) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  /** Enregistre immédiatement les modifications en attente */
  flush = async (): Promise<boolean> => {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.state.save === 'saved' || this.state.save === 'conflict') return this.state.save === 'saved';
    if (this.saving) { this.pending = true; return false; }
    this.saving = true;
    const data = this.state.data;
    this.emit({ save: 'saving' });
    try {
      const r = await api<{ rev: number; updatedAt: string; statut: 'brouillon'; devalidee: boolean }>(`/observations/${this.state.full.id}`, { method: 'PUT', body: { data, rev: this.state.rev } });
      const changedMeanwhile = this.state.data !== data;
      this.emit({
        rev: r.rev, lastSaved: new Date(r.updatedAt), error: null,
        save: changedMeanwhile ? 'dirty' : 'saved',
        full: { ...this.state.full, rev: r.rev, statut: r.statut, validePar: r.devalidee ? null : this.state.full.validePar, valideLe: r.devalidee ? null : this.state.full.valideLe, updatedAt: r.updatedAt },
      });
      if (changedMeanwhile || this.pending) { this.pending = false; this.schedule(300); }
      return !changedMeanwhile;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        this.emit({ save: 'conflict', error: e.message });
      } else if (e instanceof ApiError && e.status === 401) {
        this.emit({ save: 'error', error: 'Session expirée : reconnectez-vous, vos modifications seront enregistrées.' });
      } else if (e instanceof ApiError) {
        this.emit({ save: 'error', error: e.message });
      } else {
        this.emit({ save: 'offline', error: 'Serveur injoignable : nouvelle tentative automatique.' });
        this.schedule(5000);
      }
      return false;
    } finally {
      this.saving = false;
    }
  };

  /** Recharge la version du serveur (abandon des modifications locales en conflit) */
  reload = async () => {
    const full = await api<ObservationFull>(`/observations/${this.state.full.id}`);
    this.emit({ full, data: full.data, rev: full.rev, save: 'saved', error: null });
  };

  /** Écrase la version du serveur avec la version locale */
  forceSave = async () => {
    const full = await api<ObservationFull>(`/observations/${this.state.full.id}`);
    this.emit({ rev: full.rev, save: 'dirty', error: null });
    await this.flush();
  };

  setFull = (full: ObservationFull) => {
    this.emit({ full, rev: full.rev, data: full.data, save: 'saved' });
  };

  retry = () => {
    if (this.state.save === 'error' || this.state.save === 'offline') {
      this.emit({ save: 'dirty' });
      void this.flush();
    }
  };
}

export function useObsStore(store: ObsStore): ObsState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
