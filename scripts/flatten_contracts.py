# Reads all contracts from contracts/, flattens them, corrects licensing, then writes to contracts_flat/

from glob import glob
import subprocess
import re

license = '// SPDX-License-Identifier: GPL-3.0-or-later'
pattern = re.compile('//\ SPDX.*', re.IGNORECASE)
# clean filesystem
subprocess.run(['rm', '-rf', 'contracts_flat'])
# get files
filenames = sorted(glob('contracts/**/*', recursive=True))
# get dirs
dirs = sorted(set(map(lambda dir: 'contracts_flat/{}'.format(dir[10:]), map(lambda filename: filename[:filename.rfind('/')], filenames))))
# make dirs
for dir in dirs:
    subprocess.run(['mkdir', dir])
# flatten files
filenames = list(filter(lambda filename: filename[-4:] == '.sol', filenames))
for filename in filenames:
    # create command
    cmd = ['npx', 'hardhat', 'flatten', filename]
    print('> {}'.format(' '.join(cmd)))
    # run command
    res = subprocess.run(cmd, capture_output=True)
    # error check
    if res.returncode != 0:
        print("ERROR")
    else:
        # transform
        output = '{}\n\n{}'.format(license, re.sub(pattern, '', res.stdout.decode('utf-8')))
        # write
        new_filename = 'contracts_flat/{}'.format(filename[10:])
        file = open(new_filename, 'w')
        _ = file.write(output)
        file.close()
