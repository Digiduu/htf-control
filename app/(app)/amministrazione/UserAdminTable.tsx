"use client";

import { useActionState, useState, useTransition } from "react";
import { createUser, deleteUser, resetUserPassword, setUserBanned, updateUser } from "./actions";
import type { Profile, UserRole, VisibilityGroup } from "./lib/types";

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";
const primaryButtonClass =
  "rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50";
const secondaryButtonClass =
  "rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50";
const dangerButtonClass =
  "rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50";

const VISIBILITY_LABEL: Record<VisibilityGroup, string> = {
  global: "Globale",
  commerciale_digiduu: "Commerciale Digiduu",
  project_leader: "Project Leader",
};

function isBanned(profile: Profile) {
  return !!profile.banned_until && new Date(profile.banned_until) > new Date();
}

export default function UserAdminTable({
  users,
  currentUserId,
  projectLeaderOptions,
}: {
  users: Profile[];
  currentUserId: string;
  projectLeaderOptions: string[];
}) {
  return (
    <div className="space-y-6">
      <CreateUserForm projectLeaderOptions={projectLeaderOptions} />
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Utente</th>
              <th className="px-4 py-3">Ruolo</th>
              <th className="px-4 py-3">Visibilità</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3">Creato il</th>
              <th className="px-4 py-3">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSelf={user.id === currentUserId}
                projectLeaderOptions={projectLeaderOptions}
              />
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                  Nessun utente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Select "Gruppo di visualizzazione" + select "Nome Project Leader"
// condizionale: riusato sia nel form di creazione (con `name` per il submit
// via FormData) sia in modalità modifica riga (stato controllato, nessun
// <form> attorno — gli attributi `name` lì sono innocui).
function VisibilityFields({
  idPrefix,
  group,
  onGroupChange,
  projectLeaderName,
  onProjectLeaderNameChange,
  projectLeaderOptions,
  disabled,
}: {
  idPrefix: string;
  group: VisibilityGroup;
  onGroupChange: (group: VisibilityGroup) => void;
  projectLeaderName: string;
  onProjectLeaderNameChange: (name: string) => void;
  projectLeaderOptions: string[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-700" htmlFor={`${idPrefix}-visibilityGroup`}>
          Gruppo di visualizzazione
        </label>
        <select
          id={`${idPrefix}-visibilityGroup`}
          name="visibilityGroup"
          value={group}
          disabled={disabled}
          onChange={(event) => onGroupChange(event.target.value as VisibilityGroup)}
          className={`mt-1 ${inputClass}`}
        >
          <option value="global">Globale</option>
          <option value="commerciale_digiduu">Commerciale Digiduu</option>
          <option value="project_leader">Project Leader</option>
        </select>
      </div>
      {group === "project_leader" && (
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700" htmlFor={`${idPrefix}-projectLeaderName`}>
            Nome Project Leader
          </label>
          <select
            id={`${idPrefix}-projectLeaderName`}
            name="projectLeaderName"
            value={projectLeaderName}
            disabled={disabled}
            onChange={(event) => onProjectLeaderNameChange(event.target.value)}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">Seleziona…</option>
            {projectLeaderOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function CreateUserForm({ projectLeaderOptions }: { projectLeaderOptions: string[] }) {
  const [state, formAction, pending] = useActionState(createUser, undefined);
  const [group, setGroup] = useState<VisibilityGroup>("global");
  const [projectLeaderName, setProjectLeaderName] = useState("");

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">Nuovo utente</h2>
      <p className="mt-1 text-xs text-gray-500">
        Viene creato come utente standard. Comunica tu la password all&apos;utente: gli consigliamo di cambiarla al primo
        accesso.
      </p>
      <form action={formAction} className="mt-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700" htmlFor="new-email">
              Email
            </label>
            <input id="new-email" name="email" type="email" required className={`mt-1 ${inputClass}`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700" htmlFor="new-fullName">
              Nome
            </label>
            <input id="new-fullName" name="fullName" type="text" className={`mt-1 ${inputClass}`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700" htmlFor="new-password">
              Password temporanea
            </label>
            <input
              id="new-password"
              name="password"
              type="text"
              required
              minLength={8}
              className={`mt-1 ${inputClass}`}
            />
          </div>
        </div>
        <VisibilityFields
          idPrefix="new"
          group={group}
          onGroupChange={setGroup}
          projectLeaderName={projectLeaderName}
          onProjectLeaderNameChange={setProjectLeaderName}
          projectLeaderOptions={projectLeaderOptions}
        />
        <div>
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Creazione in corso…" : "Crea utente"}
          </button>
        </div>
      </form>
      {state && "error" in state && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state && "success" in state && <p className="mt-2 text-sm text-emerald-700">Utente creato.</p>}
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  projectLeaderOptions,
}: {
  user: Profile;
  isSelf: boolean;
  projectLeaderOptions: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [role, setRole] = useState<UserRole>(user.role);
  const [group, setGroup] = useState<VisibilityGroup>(user.visibility_group);
  const [projectLeaderName, setProjectLeaderName] = useState(user.project_leader_name ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const banned = isBanned(user);

  function resetFields() {
    setFullName(user.full_name ?? "");
    setRole(user.role);
    setGroup(user.visibility_group);
    setProjectLeaderName(user.project_leader_name ?? "");
  }

  function saveEdit() {
    setError(null);
    startTransition(async () => {
      const result = await updateUser(user.id, {
        fullName,
        role,
        visibilityGroup: role === "superadmin" ? "global" : group,
        projectLeaderName,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  function submitPasswordReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetUserPassword(user.id, newPassword);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setResetting(false);
      setNewPassword("");
    });
  }

  function toggleBanned() {
    setError(null);
    startTransition(async () => {
      const result = await setUserBanned(user.id, !banned);
      if ("error" in result) setError(result.error);
    });
  }

  function handleDelete() {
    if (!confirm(`Eliminare definitivamente ${user.email}?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteUser(user.id);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <tr className="border-b border-gray-100 align-top last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{user.email}</div>
        {editing ? (
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Nome"
            className={`mt-1 ${inputClass}`}
          />
        ) : (
          <div className="text-xs text-gray-500">{user.full_name || "—"}</div>
        )}
        {isSelf && <div className="mt-1 text-[11px] uppercase tracking-wide text-gray-400">tu</div>}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            className={inputClass}
          >
            <option value="std_user">Utente standard</option>
            <option value="superadmin">Superadmin</option>
          </select>
        ) : (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              user.role === "superadmin" ? "bg-violet-50 text-violet-700" : "bg-gray-100 text-gray-600"
            }`}
          >
            {user.role === "superadmin" ? "Superadmin" : "Utente standard"}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          role === "superadmin" ? (
            <span className="text-xs text-gray-400">non applicabile</span>
          ) : (
            <VisibilityFields
              idPrefix={`edit-${user.id}`}
              group={group}
              onGroupChange={setGroup}
              projectLeaderName={projectLeaderName}
              onProjectLeaderNameChange={setProjectLeaderName}
              projectLeaderOptions={projectLeaderOptions}
            />
          )
        ) : user.role === "superadmin" ? (
          <span className="text-xs text-gray-400">—</span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {VISIBILITY_LABEL[user.visibility_group]}
            {user.visibility_group === "project_leader" && user.project_leader_name
              ? ` · ${user.project_leader_name}`
              : ""}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            banned ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {banned ? "Disabilitato" : "Attivo"}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">
        {new Date(user.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {editing ? (
            <>
              <button type="button" disabled={isPending} onClick={saveEdit} className={secondaryButtonClass}>
                Salva
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setEditing(false);
                  resetFields();
                }}
                className={secondaryButtonClass}
              >
                Annulla
              </button>
            </>
          ) : (
            <button type="button" disabled={isPending} onClick={() => setEditing(true)} className={secondaryButtonClass}>
              Modifica
            </button>
          )}
          <button
            type="button"
            disabled={isPending || isSelf}
            onClick={toggleBanned}
            className={secondaryButtonClass}
            title={isSelf ? "Non puoi disabilitare il tuo stesso account" : undefined}
          >
            {banned ? "Riabilita" : "Disabilita"}
          </button>
          <button type="button" disabled={isPending} onClick={() => setResetting((v) => !v)} className={secondaryButtonClass}>
            Reimposta password
          </button>
          <button
            type="button"
            disabled={isPending || isSelf}
            onClick={handleDelete}
            className={dangerButtonClass}
            title={isSelf ? "Non puoi eliminare il tuo stesso account" : undefined}
          >
            Elimina
          </button>
        </div>
        {resetting && (
          <div className="mt-2 flex items-center gap-1.5">
            <input
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Nuova password"
              minLength={8}
              className={inputClass}
            />
            <button type="button" disabled={isPending} onClick={submitPasswordReset} className={secondaryButtonClass}>
              Conferma
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}
