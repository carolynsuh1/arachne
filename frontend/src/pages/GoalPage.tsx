import { GoalForm } from "../components/GoalForm"

export function GoalPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-sans text-sm tracking-wide text-stone-500 uppercase">
        Phase 1
      </p>
      <h1 className="mt-2 text-4xl leading-tight">Who should you know next?</h1>
      <p className="mt-4 max-w-xl text-lg text-stone-700">
        Enter a goal. YourWeb will later search your network for the people and
        organizations that can help you get there.
      </p>
      <div className="mt-8">
        <GoalForm />
      </div>
    </div>
  )
}
