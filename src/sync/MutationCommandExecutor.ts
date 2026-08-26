import type {
  UnitOfWork,
  UnitOfWorkStore,
  UnitOfWorkTransaction,
} from '@/unitOfWork/contracts'
import type { MutationIntent } from './contracts'

export function executeMutation<T>(
  unitOfWork: UnitOfWork,
  mutation: MutationIntent,
  stores: readonly UnitOfWorkStore[],
  command: (transaction: UnitOfWorkTransaction) => Promise<T>,
): Promise<T> {
  return unitOfWork.execute(stores, command, { mutation })
}
