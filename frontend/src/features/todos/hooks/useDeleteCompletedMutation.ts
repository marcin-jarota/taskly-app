import { useMutation, useQueryClient } from '@tanstack/react-query'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'

export function useDeleteCompletedMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: todoKeys.deleteCompleted,
    mutationFn: () => todosApi.removeCompleted(),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: todoKeys.list })
      queryClient.setQueryData<Todo[]>(todoKeys.list, (current) =>
        current?.filter((todo) => !todo.completed),
      )
    },
  })
}
