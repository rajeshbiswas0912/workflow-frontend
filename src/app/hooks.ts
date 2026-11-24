import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './store';
import { selectCurrentRole } from './selectors';
import { canDo } from '../utils/permissions';
import type { Action, Area } from '../types';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/** Permission check for the signed-in user, based on their role's current permissions. */
export function useCan() {
  const role = useAppSelector(selectCurrentRole);
  return (area: Area, action: Action = 'view') => canDo(role, area, action);
}
