'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Mail, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const newsletterSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

type NewsletterFormData = z.infer<typeof newsletterSchema>

export function NewsletterForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<NewsletterFormData>({
    resolver: zodResolver(newsletterSchema),
  })

  const onSubmit = async (data: NewsletterFormData) => {
    setIsSubmitting(true)
    try {
      // TODO: Implement newsletter subscription API
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setIsSuccess(true)
      reset()
      setTimeout(() => setIsSuccess(false), 5000)
    } catch (error) {
      console.error('Newsletter subscription error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-4 sm:flex sm:max-w-md mx-auto">
      <label htmlFor="email-address" className="sr-only">
        Email address
      </label>
      <div className="flex-1">
        <input
          {...register('email')}
          type="email"
          autoComplete="email"
          required
          className={cn(
            'block w-full rounded-md border-0 px-4 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300',
            'placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600',
            'sm:text-sm sm:leading-6',
            errors.email && 'ring-danger-600 focus:ring-danger-600'
          )}
          placeholder="Enter your email"
          disabled={isSubmitting || isSuccess}
        />
        {errors.email && (
          <p className="mt-2 text-sm text-danger-600">{errors.email.message}</p>
        )}
      </div>
      <div className="mt-3 sm:ml-3 sm:mt-0 sm:flex-shrink-0">
        <Button
          type="submit"
          disabled={isSubmitting || isSuccess}
          className={cn(
            'w-full',
            isSuccess && 'bg-success-600 hover:bg-success-700'
          )}
        >
          {isSuccess ? (
            <>
              <CheckCircle className="mr-2 h-4 w-4" />
              Subscribed!
            </>
          ) : (
            <>
              <Mail className="mr-2 h-4 w-4" />
              {isSubmitting ? 'Subscribing...' : 'Subscribe'}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}