# Reads all contracts from contracts/, flattens them, corrects licensing and pragma solidity, then writes to contracts_processed/
# Add --files and a comma separated list to only process those contracts, eg
# python3 scripts/process_contracts.py --files MyFirstContract.sol,mocks/MyMockContract.sol

from glob import glob
import subprocess
import re
import argparse
parser = argparse.ArgumentParser()
parser.add_argument("-f", "--files", help="list of files to process")
args = parser.parse_args()

# license to add
license = '// SPDX-License-Identifier: GPL-3.0-or-later'
# licenses to remove
license_pattern = re.compile('//\ SPDX.*', re.IGNORECASE)
# pragma to use
pragma = 'pragma solidity 0.8.0';
# no floating pragmas
pragma_pattern = re.compile('pragma\\ solidity\\ \\^0\\.8\\.0')
# get files
filenames = sorted(glob('contracts/**/*', recursive=True))
# if not just specific files
if args.files is None:
    # clean filesystem
    subprocess.run(['rm', '-rf', 'contracts_processed'])
    # get dirs
    dirs = sorted(set(map(lambda dir: 'contracts_processed/{}'.format(dir[10:]), map(lambda filename: filename[:filename.rfind('/')], filenames))))
    # make dirs
    for dir in dirs:
        subprocess.run(['mkdir', dir])
# for each file
filenames = list(filter(lambda filename: filename[-4:] == '.sol', filenames)) if args.files is None else list(map(lambda x: 'contracts/{}'.format(x), args.files.split(',')))
for filename in filenames:
    # create flatten command
    cmd = ['npx', 'hardhat', 'flatten', filename]
    #print('> {}'.format(' '.join(cmd)))
    print('processing {}'.format(filename))
    # run command
    new_filename = 'contracts_processed/{}'.format(filename[10:])
    file_f = open(new_filename, 'w')
    res = subprocess.run(cmd, stdout=file_f, text=True)
    file_f.close()
    # error check
    if res.returncode != 0:
        print("ERROR")
    else:
        # read flattened file
        file_r = open(new_filename, 'r')
        output = file_r.read()
        file_r.close()
        # correct licensing
        output = '{}\n\n{}'.format(license, re.sub(license_pattern, '', output))
        # correct pragma
        output = re.sub(pragma_pattern, pragma, output)
        # write
        file_w = open(new_filename, 'w')
        _ = file_w.write(output)
        file_w.close()
