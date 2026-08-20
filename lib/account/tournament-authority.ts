export interface AccountTournamentAuthorityRow {
  owner_user_id: string | null;
  created_by_user_id?: string | null;
  controller_user_id: string | null;
}

export function canReadAccountTournament(tournament: AccountTournamentAuthorityRow, userId: string): boolean {
  return tournament.created_by_user_id === userId
    || tournament.controller_user_id === userId
    || (!tournament.controller_user_id && tournament.owner_user_id === userId);
}

export function canManageAccountTournament(tournament: AccountTournamentAuthorityRow, userId: string): boolean {
  return (tournament.controller_user_id ?? tournament.owner_user_id) === userId;
}

