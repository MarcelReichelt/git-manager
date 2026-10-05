# A repository tab keeps its workspace

While a repository tab is open, its workspace stays: the terminals keep running and the selected branch stays. Selecting another repository tab shows that tab's workspace. Closing a repository tab ends its terminals. The next launch opens the repository tabs again, in order, with the last selected one selected, and without the terminals or the selected branch. A repository tab that only remembered the registered repository was rejected, because that is what switching repositories does today: it clears the terminals and the branch selection.
